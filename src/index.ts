import { Context, Schema } from 'koishi'

export const name = 'jm-downloader'

// 基础配置
export interface Config {
  // 下载选项
  option?: JmOption;
  // 是否启用日志
  enableLog?: boolean;
  // 保存路径
  savePath?: string;
}

export const Config: Schema<Config> = Schema.object({
  option: Schema.any().description('下载选项配置，详见文档'),
  enableLog: Schema.boolean().default(true).description('是否启用下载日志'),
  savePath: Schema.string().description('漫画保存路径，默认为当前工作目录')
})

// DetailEntity 接口
interface DetailEntity {
  skip: boolean;
  length: number;
  [key: string]: any;
}

// JmAlbumDetail 接口
interface JmAlbumDetail extends DetailEntity {
  id: string;
  name: string;
  author: string;
  tags: string[];
  page_count: number;
}

// JmPhotoDetail 接口
interface JmPhotoDetail extends DetailEntity {
  id: string;
  name: string;
  album_id: string;
  index: number;
  from_album: JmAlbumDetail;
}

// JmImageDetail 接口
interface JmImageDetail {
  tag: string;
  img_url: string;
  download_url: string;
  save_path: string;
  exists: boolean;
  skip: boolean;
  from_photo: JmPhotoDetail;
  scramble_id: string;
}

// JmOption 接口
interface JmOption {
  decide_image_filepath(image: JmImageDetail): string;
  decide_download_cache(image: JmImageDetail): boolean;
  decide_download_image_decode(image: JmImageDetail): boolean;
  decide_photo_batch_count(album: JmAlbumDetail): number;
  decide_image_batch_count(photo: JmPhotoDetail): number;
  build_jm_client(): JmcomicClient;
  call_all_plugin(event: string, params: any): void;
}

// JmcomicClient 接口
interface JmcomicClient {
  get_album_detail(album_id: string): JmAlbumDetail;
  get_photo_detail(photo_id: string): JmPhotoDetail;
  check_photo(photo: JmPhotoDetail): void;
  download_by_image_detail(image: JmImageDetail, img_save_path: string, decode_image: boolean): void;
}

// 日志函数类型
type LogFunction = (topic: string, msg: string) => void;

// 工具函数
function jm_log(topic: string, msg: string): void {
  // 日志实现
  console.log(`[${topic}] ${msg}`);
}

function file_exists(path: string): boolean {
  // 文件存在检查实现
  const fs = require('fs');
  return fs.existsSync(path);
}

function multi_thread_launcher<T>(params: {
  iter_objs: T[],
  apply_each_obj_func: (obj: T) => any,
  wait_finish?: boolean
}): void {
  // 多线程执行实现
  const promises = params.iter_objs.map(obj => {
    return Promise.resolve().then(() => params.apply_each_obj_func(obj));
  });
  
  if (params.wait_finish) {
    Promise.all(promises).catch(err => console.error('多线程执行错误:', err));
  }
}

function thread_pool_executor<T>(params: {
  iter_objs: T[],
  apply_each_obj_func: (obj: T) => any,
  max_workers: number
}): void {
  // 线程池执行实现
  const { iter_objs, apply_each_obj_func, max_workers } = params;
  
  const executeNext = (index: number = 0, running: Promise<any>[] = []): Promise<void> => {
    // 所有任务完成
    if (index >= iter_objs.length && running.length === 0) {
      return Promise.resolve();
    }
    
    // 等待一个任务完成再执行下一个
    if (index >= iter_objs.length) {
      return Promise.race(running)
        .then(finished => {
          const newRunning = running.filter(p => p !== finished);
          return executeNext(index, newRunning);
        });
    }
    
    // 还有空闲线程，继续添加任务
    if (running.length < max_workers) {
      const task = Promise.resolve().then(() => apply_each_obj_func(iter_objs[index]));
      return executeNext(index + 1, [...running, task]);
    }
    
    // 线程池已满，等待任务完成
    return Promise.race(running)
      .then(finished => {
        const newRunning = running.filter(p => p !== finished);
        return executeNext(index, newRunning);
      });
  };
  
  executeNext().catch(err => console.error('线程池执行错误:', err));
}

// 下载回调类
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
      `章节下载完成: [${photo.id}] (${photo.album_id}[${photo.index}/${photo.from_album.length}])`
    );
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
      `图片下载完成: ${image.tag}, [${image.img_url}] → [${img_save_path}]`
    );
  }
}

// 主下载器类
class JmDownloader extends DownloadCallback {
  option: JmOption;
  download_success_dict: Map<JmAlbumDetail, Map<JmPhotoDetail, [string, JmImageDetail][]>>;
  download_failed_list: [JmImageDetail, Error][];

  constructor(option: JmOption) {
    super();
    this.option = option;
    this.download_success_dict = new Map();
    this.download_failed_list = [];
  }

  download_album(album_id: string): JmAlbumDetail {
    const client = this.client_for_album(album_id);
    const album = client.get_album_detail(album_id);
    this.download_by_album_detail(album, client);
    return album;
  }

  download_by_album_detail(album: JmAlbumDetail, client: JmcomicClient): void {
    this.before_album(album);
    if (album.skip) {
      return;
    }
    this.execute_by_condition({
      iter_objs: album as unknown as any[],
      apply: (photo) => this.download_by_photo_detail(photo as JmPhotoDetail, client),
      count_batch: this.option.decide_photo_batch_count(album)
    });
    this.after_album(album);
  }

  download_photo(photo_id: string): JmPhotoDetail {
    const client = this.client_for_photo(photo_id);
    const photo = client.get_photo_detail(photo_id);
    this.download_by_photo_detail(photo, client);
    return photo;
  }

  download_by_photo_detail(photo: JmPhotoDetail, client: JmcomicClient): void {
    client.check_photo(photo);

    this.before_photo(photo);
    if (photo.skip) {
      return;
    }
    this.execute_by_condition({
      iter_objs: photo as unknown as any[],
      apply: (image) => this.download_by_image_detail(image as JmImageDetail, client),
      count_batch: this.option.decide_image_batch_count(photo)
    });
    this.after_photo(photo);
  }

  download_by_image_detail(image: JmImageDetail, client: JmcomicClient): void {
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
      client.download_by_image_detail(
        image,
        img_save_path,
        decode_image,
      );
    } catch (e) {
      jm_log('image.failed', `图片下载失败: [${image.download_url}], 异常: ${e}`);
      // 保存失败记录
      this.download_failed_list.push([image, e as Error]);
      throw e;
    }

    this.after_image(image, img_save_path);
  }

  execute_by_condition(params: {
    iter_objs: DetailEntity,
    apply: (obj: any) => void,
    count_batch: number
  }): void {
    const { iter_objs, apply, count_batch } = params;
    const filtered_objs = this.do_filter(iter_objs);
    const count_real = filtered_objs.length;

    if (count_real === 0) {
      return;
    }

    if (count_batch >= count_real) {
      // 一个图/章节 对应 一个线程
      multi_thread_launcher({
        iter_objs: filtered_objs as any[],
        apply_each_obj_func: apply,
      });
    } else {
      // 创建batch个线程的线程池
      thread_pool_executor({
        iter_objs: filtered_objs as any[],
        apply_each_obj_func: apply,
        max_workers: count_batch,
      });
    }
  }

  do_filter(detail: DetailEntity): any[] {
    // 该方法可用于过滤本子/章节，默认不会做过滤
    return detail as unknown as any[];
  }

  client_for_album(jm_album_id: string): JmcomicClient {
    // 默认情况下，所有的JmDownloader共用一个JmcomicClient
    return this.option.build_jm_client();
  }

  client_for_photo(jm_photo_id: string): JmcomicClient {
    // 默认情况下，所有的JmDownloader共用一个JmcomicClient
    return this.option.build_jm_client();
  }

  get all_success(): boolean {
    // 是否成功下载了全部图片
    if (this.download_failed_list.length !== 0) {
      return false;
    }

    for (const [album, photo_dict] of this.download_success_dict.entries()) {
      if (album.length !== photo_dict.size) {
        return false;
      }

      for (const [photo, image_list] of photo_dict.entries()) {
        if (photo.length !== image_list.length) {
          return false;
        }
      }
    }

    return true;
  }

  // 回调方法扩展
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
}

// 不下载图片的版本
class DoNotDownloadImage extends JmDownloader {
  download_by_image_detail(image: JmImageDetail, client: JmcomicClient): void {
    // ensure make dir
    this.option.decide_image_filepath(image);
  }
}

// 只下载特定数量图片的版本
class JustDownloadSpecificCountImage extends JmDownloader {
  private static count_lock = new Mutex();
  private static count = 0;

  download_by_image_detail(image: JmImageDetail, client: JmcomicClient): void {
    // ensure make dir
    this.option.decide_image_filepath(image);

    if (this.try_countdown()) {
      return super.download_by_image_detail(image, client);
    }
  }

  try_countdown(): boolean {
    if (JustDownloadSpecificCountImage.count < 0) {
      return false;
    }

    return JustDownloadSpecificCountImage.count_lock.runExclusive(() => {
      if (JustDownloadSpecificCountImage.count < 0) {
        return false;
      }

      JustDownloadSpecificCountImage.count--;
      return JustDownloadSpecificCountImage.count >= 0;
    });
  }

  static use(count: number): void {
    JustDownloadSpecificCountImage.count = count;
    // 将当前类设为默认下载器
  }
}

// 互斥锁简单实现
class Mutex {
  private mutex = Promise.resolve();

  lock(): PromiseLike<() => void> {
    let begin: (unlock: () => void) => void = unlock => {};
    
    this.mutex = this.mutex.then(() => {
      return new Promise(begin);
    });
    
    return new Promise(resolve => {
      begin = resolve;
    });
  }

  async runExclusive<T>(callback: () => Promise<T> | T): Promise<T> {
    const unlock = await this.lock();
    try {
      return await callback();
    } finally {
      unlock();
    }
  }
}

// API 导出函数
export async function download_album(jm_album_id: string, option?: JmOption): Promise<JmAlbumDetail> {
  // 实现下载相册功能
  const downloader = new JmDownloader(option || createDefaultOption());
  try {
    return downloader.download_album(jm_album_id);
  } finally {
    // 清理资源
  }
}

export async function download_photo(jm_photo_id: string, option?: JmOption): Promise<JmPhotoDetail> {
  // 实现下载章节功能
  const downloader = new JmDownloader(option || createDefaultOption());
  try {
    return downloader.download_photo(jm_photo_id);
  } finally {
    // 清理资源
  }
}

function createDefaultOption(): JmOption {
  // 创建默认配置
  return {
    decide_image_filepath: (image) => `./downloads/${image.from_photo.album_id}/${image.from_photo.id}/${image.tag}.jpg`,
    decide_download_cache: (image) => true,
    decide_download_image_decode: (image) => true,
    decide_photo_batch_count: (album) => 5,
    decide_image_batch_count: (photo) => 10,
    build_jm_client: () => {
      // 返回默认客户端
      return {} as JmcomicClient;
    },
    call_all_plugin: (event, params) => {
      // 插件系统实现
    }
  };
}

export function apply(ctx: Context, config: Config) {
  // 插件初始化
  if (!config.enableLog) {
    // 禁用日志
  }
  
  // 注册命令
  ctx.command('jm', '禁漫下载')
    .option('id', '-i <id:string> 禁漫车号')
    .option('type', '-t <type:string> 下载类型：album 或 photo')
    .action(async ({ options }) => {
      const { id, type } = options;
      if (!id) {
        return '请提供禁漫车号';
      }
      
      try {
        if (type === 'photo') {
          await download_photo(id);
          return `成功下载章节：${id}`;
        } else {
          await download_album(id);
          return `成功下载本子：${id}`;
        }
      } catch (error) {
        return `下载失败：${error.message}`;
      }
    });
}
