import { JmOption } from './jm_option';

// 表示详细实体的接口
interface DetailEntity {
  length: number;
  [index: number]: any;
  skip?: boolean;
  filter?(items: any[]): any[];
}

// 专辑详情接口
interface JmAlbumDetail extends DetailEntity {
  id: string | number;
  author: string;
  name: string;
  page_count: number;
  tags: string[];
}

// 章节详情接口
interface JmPhotoDetail extends DetailEntity {
  id: string | number;
  album_id: string | number;
  index: number;
  name: string;
  from_album: JmAlbumDetail;
}

// 图片详情接口
interface JmImageDetail {
  tag: string;
  img_url: string;
  download_url: string;
  from_photo: JmPhotoDetail;
  save_path?: string;
  exists?: boolean;
  skip?: boolean;
}

// JmcomicClient接口
interface JmcomicClient {
  get_album_detail(albumId: string | number): JmAlbumDetail;
  get_photo_detail(photoId: string | number): JmPhotoDetail;
  check_photo(photo: JmPhotoDetail): void;
  download_by_image_detail(
    image: JmImageDetail,
    imgSavePath: string,
    options?: {
      decode_image?: boolean;
    }
  ): Promise<void>;
}

// 日志函数
function jm_log(category: string, message: string): void {
  console.log(`[${category}] ${message}`);
}

// 文件是否存在
function file_exists(path: string): boolean {
  // 在实际环境中需要实现
  return false;
}

// 多线程启动器
async function multi_thread_launcher<T>(options: {
  iter_objs: T[];
  apply_each_obj_func: (obj: T) => Promise<void>;
}): Promise<void> {
  await Promise.all(
    options.iter_objs.map(obj => options.apply_each_obj_func(obj))
  );
}

// 线程池执行器
async function thread_pool_executor<T>(options: {
  iter_objs: T[];
  apply_each_obj_func: (obj: T) => Promise<void>;
  max_workers: number;
}): Promise<void> {
  const { iter_objs, apply_each_obj_func, max_workers } = options;

  // 基本的并发限制实现
  const chunks: T[][] = [];
  for (let i = 0; i < iter_objs.length; i += max_workers) {
    chunks.push(iter_objs.slice(i, i + max_workers));
  }

  for (const chunk of chunks) {
    await Promise.all(chunk.map(obj => apply_each_obj_func(obj)));
  }
}

// 模块配置
class JmModuleConfig {
  static CLASS_DOWNLOADER: any;
}

// DownloadCallback类
class DownloadCallback {
  before_album(album: JmAlbumDetail): void {
    jm_log('album.before',
      `本子获取成功: [${album.id}], ` +
      `作者: [${album.author}], ` +
      `章节数: [${album.length}], ` +
      `总页数: [${album.page_count}], ` +
      `标题: [${album.name}], ` +
      `关键词: ${album.tags}`
    );
  }

  after_album(album: JmAlbumDetail): void {
    jm_log('album.after', `本子下载完成: [${album.id}]`);
  }

  before_photo(photo: JmPhotoDetail): void {
    jm_log('photo.before',
      `开始下载章节: ${photo.id} (${photo.album_id}[${photo.index}/${photo.from_album.length}]), ` +
      `标题: [${photo.name}], ` +
      `图片数为[${photo.length}]`
    );
  }

  after_photo(photo: JmPhotoDetail): void {
    jm_log('photo.after',
      `章节下载完成: [${photo.id}] (${photo.album_id}[${photo.index}/${photo.from_album.length}])`);
  }

  before_image(image: JmImageDetail, img_save_path: string): void {
    if (image.exists) {
      jm_log('image.before',
        `图片已存在: ${image.tag} ← [${img_save_path}]`
      );
    } else {
      jm_log('image.before',
        `图片准备下载: ${image.tag}, [${image.img_url}] → [${img_save_path}]`
      );
    }
  }

  after_image(image: JmImageDetail, img_save_path: string): void {
    jm_log('image.after',
      `图片下载完成: ${image.tag}, [${image.img_url}] → [${img_save_path}]`);
  }
}

// 互斥锁实现
class Mutex {
  private mutex = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release: () => void = () => {};

    const newMutex = new Promise<void>(resolve => {
      release = () => resolve();
    });

    const oldMutex = this.mutex;
    this.mutex = oldMutex.then(() => newMutex);
    await oldMutex;

    return release;
  }
}

// JmDownloader类
export class JmDownloader extends DownloadCallback {
  option: JmOption;
  download_success_dict: Map<JmAlbumDetail, Map<JmPhotoDetail, [string, JmImageDetail][]>>;
  download_failed_list: [JmImageDetail, Error][];

  constructor(option: JmOption) {
    super();
    this.option = option;
    this.download_success_dict = new Map();
    this.download_failed_list = [];
  }

  async download_album(album_id: string | number): Promise<JmAlbumDetail> {
    const client = this.client_for_album(album_id);
    const album = client.get_album_detail(album_id);
    await this.download_by_album_detail(album, client);
    return album;
  }

  async download_by_album_detail(album: JmAlbumDetail, client: JmcomicClient): Promise<void> {
    this.before_album(album);
    if (album.skip) {
      return;
    }

    // 收集所有需要处理的章节
    const photos: JmPhotoDetail[] = [];
    for (let i = 0; i < album.length; i++) {
      photos.push(album[i]);
    }

    const filteredPhotos = this.do_filter(photos as unknown as DetailEntity) as JmPhotoDetail[];

    await this.execute_by_condition({
      iter_objs: filteredPhotos,
      apply: async (photo) => await this.download_by_photo_detail(photo, client),
      count_batch: this.option.decide_photo_batch_count(album)
    });

    this.after_album(album);
  }

  async download_photo(photo_id: string | number): Promise<JmPhotoDetail> {
    const client = this.client_for_photo(photo_id);
    const photo = client.get_photo_detail(photo_id);
    await this.download_by_photo_detail(photo, client);
    return photo;
  }

  async download_by_photo_detail(photo: JmPhotoDetail, client: JmcomicClient): Promise<void> {
    client.check_photo(photo);

    this.before_photo(photo);
    if (photo.skip) {
      return;
    }

    // 收集所有需要处理的图片
    const images: JmImageDetail[] = [];
    for (let i = 0; i < photo.length; i++) {
      images.push(photo[i]);
    }

    const filteredImages = this.do_filter(images as unknown as DetailEntity) as JmImageDetail[];

    await this.execute_by_condition({
      iter_objs: filteredImages,
      apply: async (image) => await this.download_by_image_detail(image, client),
      count_batch: this.option.decide_image_batch_count(photo)
    });

    this.after_photo(photo);
  }

  async download_by_image_detail(image: JmImageDetail, client: JmcomicClient): Promise<void> {
    const img_save_path = this.option.decide_image_filepath(image);

    image.save_path = img_save_path;
    image.exists = file_exists(img_save_path);

    this.before_image(image, img_save_path);

    if (image.skip) {
      return;
    }

    // let option decide use_cache and decode_image
    const use_cache = this.option.decide_download_cache(image);
    const decode_image = this.option.decide_download_image_decode(image);

    // skip download
    if (use_cache === true && image.exists) {
      return;
    }

    try {
      await client.download_by_image_detail(
        image,
        img_save_path,
        { decode_image }
      );
    } catch (e) {
      jm_log('image.failed', `图片下载失败: [${image.download_url}], 异常: ${e}`);
      // 保存失败记录
      this.download_failed_list.push([image, e as Error]);
      throw e;
    }

    this.after_image(image, img_save_path);
  }

  async execute_by_condition(options: {
    iter_objs: any[],
    apply: (obj: any) => Promise<void>,
    count_batch: number
  }): Promise<void> {
    const { iter_objs, apply, count_batch } = options;
    const count_real = iter_objs.length;

    if (count_real === 0) {
      return;
    }

    if (count_batch >= count_real) {
      // 一个图/章节 对应 一个线程
      await multi_thread_launcher({
        iter_objs,
        apply_each_obj_func: apply,
      });
    } else {
      // 创建batch个线程的线程池
      await thread_pool_executor({
        iter_objs,
        apply_each_obj_func: apply,
        max_workers: count_batch,
      });
    }
  }

  do_filter(detail: DetailEntity): DetailEntity {
    return detail;
  }

  client_for_album(jm_album_id: string | number): JmcomicClient {
    return this.option.build_jm_client();
  }

  client_for_photo(jm_photo_id: string | number): JmcomicClient {
    return this.option.build_jm_client();
  }

  get all_success(): boolean {
    if (this.download_failed_list.length !== 0) {
      return false;
    }

    for (const [album, photo_map] of this.download_success_dict.entries()) {
      if (album.length !== photo_map.size) {
        return false;
      }

      for (const [photo, image_list] of photo_map.entries()) {
        if (photo.length !== image_list.length) {
          return false;
        }
      }
    }

    return true;
  }

  // 回调方法
  before_album(album: JmAlbumDetail): void {
    super.before_album(album);
    if (!this.download_success_dict.has(album)) {
      this.download_success_dict.set(album, new Map());
    }
    this.option.call_all_plugin(
      'before_album',
      { album, downloader: this }
    );
  }

  after_album(album: JmAlbumDetail): void {
    super.after_album(album);
    this.option.call_all_plugin(
      'after_album',
      { album, downloader: this }
    );
  }

  before_photo(photo: JmPhotoDetail): void {
    super.before_photo(photo);
    if (!this.download_success_dict.has(photo.from_album)) {
      this.download_success_dict.set(photo.from_album, new Map());
    }
    const photoMap = this.download_success_dict.get(photo.from_album)!;
    if (!photoMap.has(photo)) {
      photoMap.set(photo, []);
    }
    this.option.call_all_plugin(
      'before_photo',
      { photo, downloader: this }
    );
  }

  after_photo(photo: JmPhotoDetail): void {
    super.after_photo(photo);
    this.option.call_all_plugin(
      'after_photo',
      { photo, downloader: this }
    );
  }

  before_image(image: JmImageDetail, img_save_path: string): void {
    super.before_image(image, img_save_path);
    this.option.call_all_plugin(
      'before_image',
      { image, downloader: this }
    );
  }

  after_image(image: JmImageDetail, img_save_path: string): void {
    super.after_image(image, img_save_path);
    const photo = image.from_photo;
    const album = photo.from_album;

    const photoMap = this.download_success_dict.get(album)!;
    const imageList = photoMap.get(photo)!;
    imageList.push([img_save_path, image]);

    this.option.call_all_plugin(
      'after_image',
      { image, downloader: this }
    );
  }

  // 支持类似Python with语句的方法
  async enter(): Promise<this> {
    return this;
  }

  async exit(exc?: Error): Promise<void> {
    if (exc) {
      jm_log('dler.exception',
        `${this.constructor.name} Exit with exception: ${exc}`
      );
    }
  }

  static use(...args: any[]): void {
    JmModuleConfig.CLASS_DOWNLOADER = this;
  }
}

// 不下载图片的子类
export class DoNotDownloadImage extends JmDownloader {
  async download_by_image_detail(image: JmImageDetail, client: JmcomicClient): Promise<void> {
    // ensure make dir
    this.option.decide_image_filepath(image);
  }
}

// 只下载特定数量图片的子类
export class JustDownloadSpecificCountImage extends JmDownloader {
  private static count_lock = new Mutex();
  private static count = 0;

  async download_by_image_detail(image: JmImageDetail, client: JmcomicClient): Promise<void> {
    // ensure make dir
    this.option.decide_image_filepath(image);

    if (await this.try_countdown()) {
      return super.download_by_image_detail(image, client);
    }
  }

  async try_countdown(): Promise<boolean> {
    if (JustDownloadSpecificCountImage.count < 0) {
      return false;
    }

    const release = await JustDownloadSpecificCountImage.count_lock.acquire();
    try {
      if (JustDownloadSpecificCountImage.count < 0) {
        return false;
      }

      JustDownloadSpecificCountImage.count -= 1;

      return JustDownloadSpecificCountImage.count >= 0;
    } finally {
      release();
    }
  }

  static use(count: number): void {
    this.count = count;
    super.use();
  }
}
