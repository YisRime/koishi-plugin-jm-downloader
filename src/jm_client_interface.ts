import axios, { AxiosResponse } from 'axios';

/**
 * 工具函数和常量
 */
class ExceptionTool {
  static requireTrue(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(message);
    }
  }

  static raisesResp(message: string, resp: JmResp, exceptionType?: any): never {
    throw new Error(message);
  }
}

function fieldCache() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cacheKey = Symbol(`cache_${propertyKey}`);

    descriptor.value = function (...args: any[]) {
      if (this[cacheKey] === undefined) {
        this[cacheKey] = originalMethod.apply(this, args);
      }
      return this[cacheKey];
    };

    return descriptor;
  };
}

function suffixNotEqual(url: string, path: string): boolean {
  // 简化版实现，实际应对比文件后缀
  return url.split('.').pop() !== path.split('.').pop();
}

class JmImageTool {
  static saveRespImg(resp: JmImageResp, path: string, needConvert: boolean = false): void {
    // 保存图片到文件系统的实现
  }

  static decodeAndSave(num: number, image: any, path: string): void {
    // 解码并保存图片的实现
  }

  static getNumByUrl(scrambleId: number | string, imgUrl: string): number {
    // 实现获取用于解密的数字
    return typeof scrambleId === 'string' ? parseInt(scrambleId) : scrambleId;
  }

  static openImage(content: Buffer): any {
    // 打开图片的实现
    return content;
  }
}

class JmCryptoTool {
  static decodeRespData(encodedData: string, ts: string): string {
    // 解密响应数据的实现
    return encodedData;
  }
}

class JmMagicConstants {
  static readonly ORDER_BY_LATEST = 'mr';
  static readonly ORDER_BY_VIEW = 'mv';
  static readonly TIME_ALL = 'a';
  static readonly TIME_TODAY = 't';
  static readonly TIME_WEEK = 'w';
  static readonly TIME_MONTH = 'm';
  static readonly CATEGORY_ALL = '';
}

class JmModuleConfig {
  static getHtmlDomain(postman: Postman): string {
    return '';
  }

  static getHtmlDomainAll(postman: Postman): string[] {
    return [];
  }

  static getHtmlDomainAllViaGithub(postman: Postman): string[] {
    return [];
  }
}

class JsonResolveFailException extends Error {}

type Dict<T = any> = Record<string, T>;

class AdvancedDict {
  private data: Dict;

  constructor(data: Dict) {
    this.data = data;
  }

  // 可以添加更多高级字典功能
}

/**
 * 响应实体
 */
class JmResp {
  protected resp: AxiosResponse;

  constructor(resp: AxiosResponse) {
    ExceptionTool.requireTrue(!(resp instanceof JmResp), `重复包装: ${resp}`);
    this.resp = resp;
  }

  get isSuccess(): boolean {
    return this.httpCode === 200 && this.content.length !== 0;
  }

  get isNotSuccess(): boolean {
    return !this.isSuccess;
  }

  get content(): Buffer {
    return this.resp.data;
  }

  get httpCode(): number {
    return this.resp.status;
  }

  get text(): string {
    return this.resp.data.toString();
  }

  get url(): string {
    return this.resp.config.url || '';
  }

  requireSuccess(): void {
    if (this.isNotSuccess) {
      ExceptionTool.raisesResp(this.errorMsg(), this);
    }
  }

  errorMsg(): string {
    return this.text;
  }
}

class JmImageResp extends JmResp {
  errorMsg(): string {
    let msg = `禁漫图片获取失败: [${this.url}]`;
    if (this.httpCode !== 200) {
      msg += `，http状态码=${this.httpCode}`;
    }
    if (this.content.length === 0) {
      msg += `，响应数据为空`;
    }
    return msg;
  }

  transferTo(
    path: string,
    scrambleId: number | null,
    decodeImage: boolean = true,
    imgUrl?: string
  ): void {
    imgUrl = imgUrl || this.url;

    if (decodeImage === false || scrambleId === null) {
      // 不解密图片，直接保存文件
      JmImageTool.saveRespImg(
        this,
        path,
        suffixNotEqual(imgUrl.substring(0, imgUrl.indexOf('?')), path)
      );
    } else {
      // 解密图片并保存文件
      JmImageTool.decodeAndSave(
        JmImageTool.getNumByUrl(scrambleId, imgUrl),
        JmImageTool.openImage(this.content),
        path
      );
    }
  }
}

class JmJsonResp extends JmResp {
  @fieldCache()
  json(): Dict {
    try {
      return typeof this.resp.data === 'string'
        ? JSON.parse(this.resp.data)
        : this.resp.data;
    } catch (e) {
      ExceptionTool.raisesResp(`json解析失败: ${e}`, this, JsonResolveFailException);
      throw e; // 这行实际上不会执行，但TypeScript需要明确的返回或抛出
    }
  }

  model(): AdvancedDict {
    return new AdvancedDict(this.json());
  }
}

class JmApiResp extends JmJsonResp {
  private ts: string;

  constructor(resp: AxiosResponse, ts: string) {
    super(resp);
    this.ts = ts;
  }

  get isSuccess(): boolean {
    return super.isSuccess && this.json()['code'] === 200;
  }

  @fieldCache()
  get decodedData(): string {
    return JmCryptoTool.decodeRespData(this.encodedData, this.ts);
  }

  get encodedData(): string {
    return this.json()['data'];
  }

  get resData(): any {
    this.requireSuccess();
    return JSON.parse(this.decodedData);
  }

  get modelData(): AdvancedDict {
    this.requireSuccess();
    return new AdvancedDict(this.resData);
  }
}

class JmAlbumCommentResp extends JmJsonResp {
  isSuccess(): boolean {
    return super.isSuccess && this.json()['err'] === false;
  }
}

/**
 * 实体类型定义
 */
interface JmAlbumDetail {
  albumId: string | number;
  // 其他属性
}

interface JmPhotoDetail {
  photoId: string | number;
  albumId: string | number;
  fromAlbum: JmAlbumDetail | null;
  pageArr: any[] | null;
  dataOriginalDomain: string | null;
  // 其他属性
}

interface JmImageDetail {
  downloadUrl: string;
  scrambleId: string | number;
  // 其他属性
}

/**
 * 页面内容相关类型
 */
interface JmPageContent {
  pageCount: number;
  // 其他属性
}

interface JmFavoritePage extends JmPageContent {
  // 特定于收藏页的属性
}

interface JmSearchPage extends JmPageContent {
  // 特定于搜索页的属性
}

interface JmCategoryPage extends JmPageContent {
  // 特定于分类页的属性
}

/**
 * 客户端接口
 */
interface Postman {
  // 基础通信接口
  get root_postman(): Postman;
}

class JmDetailClient {
  getAlbumDetail(albumId: string | number): JmAlbumDetail {
    throw new Error("未实现");
  }

  getPhotoDetail(
    photoId: string | number,
    fetchAlbum: boolean = true,
    fetchScrambleId: boolean = true
  ): JmPhotoDetail {
    throw new Error("未实现");
  }

  checkPhoto(photo: JmPhotoDetail): void {
    /**
     * photo来源有两种:
     * 1. album[?]
     * 2. client.getPhotoDetail(?)
     *
     * 其中，只有[2]是可以包含下载图片的url信息的。
     * 本方法会检查photo是不是[1]，
     * 如果是[1]，通过请求获取[2]，然后把2中的一些重要字段更新到1中
     *
     * @param photo 被检查的JmPhotoDetail对象
     */
    // 检查 fromAlbum
    if (photo.fromAlbum === null) {
      photo.fromAlbum = this.getAlbumDetail(photo.albumId);
    }

    // 检查 pageArr 和 dataOriginalDomain
    if (photo.pageArr === null || photo.dataOriginalDomain === null) {
      const newPhoto = this.getPhotoDetail(photo.photoId, false);
      newPhoto.fromAlbum = photo.fromAlbum;
      Object.assign(photo, newPhoto);
    }
  }
}

class JmUserClient {
  login(username: string, password: string): void {
    /**
     * 1. 返回response响应对象
     * 2. 保证当前client拥有登录cookies
     */
    throw new Error("未实现");
  }

  albumComment(
    videoId: string | number,
    comment: string,
    options: {
      originator?: string,
      status?: string,
      commentId?: string | number | null,
      [key: string]: any
    } = {}
  ): JmAlbumCommentResp {
    /**
     * 评论漫画/评论回复
     * @param videoId album_id/photo_id
     * @param comment 评论内容
     * @param options.status 是否 "有劇透"
     * @param options.commentId 被回复评论的id
     * @param options.originator
     * @returns JmAlbumCommentResp 对象
     */
    throw new Error("未实现");
  }

  favoriteFolder(
    page: number = 1,
    orderBy: string = JmMagicConstants.ORDER_BY_LATEST,
    folderId: string = '0',
    username: string = ''
  ): JmFavoritePage {
    /**
     * 获取收藏了的漫画，文件夹默认是全部
     * @param folderId 文件夹id
     * @param page 分页
     * @param orderBy 排序
     * @param username 用户名
     */
    throw new Error("未实现");
  }

  addFavoriteAlbum(
    albumId: string | number,
    folderId: string = '0'
  ): void {
    /**
     * 把漫画加入收藏夹
     */
    throw new Error("未实现");
  }
}

class JmImageClient {
  downloadImage(
    imgUrl: string,
    imgSavePath: string,
    scrambleId: number | null = null,
    decodeImage: boolean = true
  ): void {
    /**
     * 下载JM的图片
     * @param imgUrl 图片url
     * @param imgSavePath 图片保存位置
     * @param scrambleId 图片所在photo的scramble_id
     * @param decodeImage 要保存的是解密后的图还是原图
     */
    // 请求图片
    const resp = this.getJmImage(imgUrl);

    resp.requireSuccess();

    return this.saveImageResp(decodeImage, imgSavePath, imgUrl, resp, scrambleId);
  }

  saveImageResp(
    decodeImage: boolean,
    imgSavePath: string,
    imgUrl: string,
    resp: JmImageResp,
    scrambleId: number | null
  ): void {
    resp.transferTo(imgSavePath, scrambleId, decodeImage, imgUrl);
  }

  downloadByImageDetail(
    image: JmImageDetail,
    imgSavePath: string,
    decodeImage: boolean = true
  ): void {
    return this.downloadImage(
      image.downloadUrl,
      imgSavePath,
      typeof image.scrambleId === 'string' ? parseInt(image.scrambleId as string) : image.scrambleId as number,
      decodeImage
    );
  }

  getJmImage(imgUrl: string): JmImageResp {
    throw new Error("未实现");
  }

  static imgIsNotNeedToDecode(dataOriginal: string, _resp: any): boolean {
    // https://cdn-msp2.18comic.vip/media/photos/498976/00027.gif?v=1697541064
    const queryParamsIndex = dataOriginal.indexOf('?');

    const url = queryParamsIndex !== -1
      ? dataOriginal.substring(0, queryParamsIndex)
      : dataOriginal;

    // https://cdn-msp2.18comic.vip/media/photos/498976/00027.gif
    return url.endsWith('.gif');
  }
}

class JmSearchAlbumClient {
  /**
   * 搜尋的最佳姿勢？
   * 【包含搜尋】
   * 搜尋[+]全彩[空格][+]人妻,僅顯示全彩且是人妻的本本
   * 範例:+全彩 +人妻
   *
   * 【排除搜尋】
   * 搜尋全彩[空格][-]人妻,顯示全彩並排除人妻的本本
   * 範例:全彩 -人妻
   *
   * 【我都要搜尋】
   * 搜尋全彩[空格]人妻,會顯示所有包含全彩及人妻的本本
   * 範例:全彩 人妻
   */

  search(
    searchQuery: string,
    page: number,
    mainTag: number,
    orderBy: string,
    time: string,
    category: string,
    subCategory: string | null
  ): JmSearchPage {
    /**
     * 搜索【成人A漫】
     * 网页端与移动端的搜索有差别：
     *
     * - 移动端不支持 category, subCategory参数，网页端支持全部参数
     */
    throw new Error("未实现");
  }

  searchSite(
    searchQuery: string,
    page: number = 1,
    orderBy: string = JmMagicConstants.ORDER_BY_LATEST,
    time: string = JmMagicConstants.TIME_ALL,
    category: string = JmMagicConstants.CATEGORY_ALL,
    subCategory: string | null = null
  ): JmSearchPage {
    /**
     * 对应禁漫的站内搜索
     */
    return this.search(searchQuery, page, 0, orderBy, time, category, subCategory);
  }

  searchWork(
    searchQuery: string,
    page: number = 1,
    orderBy: string = JmMagicConstants.ORDER_BY_LATEST,
    time: string = JmMagicConstants.TIME_ALL,
    category: string = JmMagicConstants.CATEGORY_ALL,
    subCategory: string | null = null
  ): JmSearchPage {
    /**
     * 搜索album的作品 work
     */
    return this.search(searchQuery, page, 1, orderBy, time, category, subCategory);
  }

  searchAuthor(
    searchQuery: string,
    page: number = 1,
    orderBy: string = JmMagicConstants.ORDER_BY_LATEST,
    time: string = JmMagicConstants.TIME_ALL,
    category: string = JmMagicConstants.CATEGORY_ALL,
    subCategory: string | null = null
  ): JmSearchPage {
    /**
     * 搜索album的作者 author
     */
    return this.search(searchQuery, page, 2, orderBy, time, category, subCategory);
  }

  searchTag(
    searchQuery: string,
    page: number = 1,
    orderBy: string = JmMagicConstants.ORDER_BY_LATEST,
    time: string = JmMagicConstants.TIME_ALL,
    category: string = JmMagicConstants.CATEGORY_ALL,
    subCategory: string | null = null
  ): JmSearchPage {
    /**
     * 搜索album的标签 tag
     */
    return this.search(searchQuery, page, 3, orderBy, time, category, subCategory);
  }

  searchActor(
    searchQuery: string,
    page: number = 1,
    orderBy: string = JmMagicConstants.ORDER_BY_LATEST,
    time: string = JmMagicConstants.TIME_ALL,
    category: string = JmMagicConstants.CATEGORY_ALL,
    subCategory: string | null = null
  ): JmSearchPage {
    /**
     * 搜索album的登场角色 actor
     */
    return this.search(searchQuery, page, 4, orderBy, time, category, subCategory);
  }
}

class JmCategoryClient {
  /**
   * 该接口可以看作是对全体禁漫本子的排行，热门排行的功能也派生于此
   *
   * 月排行 = 分类【时间=月，排序=观看】
   * 周排行 = 分类【时间=周，排序=观看】
   * 日排行 = 分类【时间=周，排序=观看】
   */

  categoriesFilter(
    page: number,
    time: string,
    category: string,
    orderBy: string,
    subCategory: string | null = null
  ): JmCategoryPage {
    /**
     * 分类
     *
     * @param page 页码
     * @param time 时间范围，默认是全部时间
     * @param category 类别，默认是最新，即显示最新的禁漫本子
     * @param subCategory 副分类，仅网页端有这功能
     * @param orderBy 排序方式，默认是观看数
     */
    throw new Error("未实现");
  }

  monthRanking(
    page: number,
    category: string = JmMagicConstants.CATEGORY_ALL
  ): JmCategoryPage {
    /**
     * 月排行 = 分类【时间=月，排序=观看】
     */
    return this.categoriesFilter(
      page,
      JmMagicConstants.TIME_MONTH,
      category,
      JmMagicConstants.ORDER_BY_VIEW
    );
  }

  weekRanking(
    page: number,
    category: string = JmMagicConstants.CATEGORY_ALL
  ): JmCategoryPage {
    /**
     * 周排行 = 分类【时间=周，排序=观看】
     */
    return this.categoriesFilter(
      page,
      JmMagicConstants.TIME_WEEK,
      category,
      JmMagicConstants.ORDER_BY_VIEW
    );
  }

  dayRanking(
    page: number,
    category: string = JmMagicConstants.CATEGORY_ALL
  ): JmCategoryPage {
    /**
     * 日排行 = 分类【时间=日，排序=观看】
     */
    return this.categoriesFilter(
      page,
      JmMagicConstants.TIME_TODAY,
      category,
      JmMagicConstants.ORDER_BY_VIEW
    );
  }
}

abstract class JmcomicClient implements Postman, JmImageClient, JmDetailClient, JmUserClient, JmSearchAlbumClient, JmCategoryClient {
  static readonly clientKey: any = null;

  abstract get root_postman(): Postman;

  // 由JmImageClient实现的方法
  abstract getJmImage(imgUrl: string): JmImageResp;
  saveImageResp(decodeImage: boolean, imgSavePath: string, imgUrl: string, resp: JmImageResp, scrambleId: number | null): void {
    resp.transferTo(imgSavePath, scrambleId, decodeImage, imgUrl);
  }
  downloadImage(imgUrl: string, imgSavePath: string, scrambleId: number | null, decodeImage: boolean): void {
    const resp = this.getJmImage(imgUrl);
    resp.requireSuccess();
    return this.saveImageResp(decodeImage, imgSavePath, imgUrl, resp, scrambleId);
  }
  downloadByImageDetail(image: JmImageDetail, imgSavePath: string, decodeImage: boolean): void {
    return this.downloadImage(
      image.downloadUrl,
      imgSavePath,
      typeof image.scrambleId === 'string' ? parseInt(image.scrambleId as string) : image.scrambleId as number,
      decodeImage
    );
  }

  // 由JmDetailClient实现的方法
  abstract getAlbumDetail(albumId: string | number): JmAlbumDetail;
  abstract getPhotoDetail(photoId: string | number, fetchAlbum?: boolean, fetchScrambleId?: boolean): JmPhotoDetail;
  checkPhoto(photo: JmPhotoDetail): void {
    if (photo.fromAlbum === null) {
      photo.fromAlbum = this.getAlbumDetail(photo.albumId);
    }
    if (photo.pageArr === null || photo.dataOriginalDomain === null) {
      const newPhoto = this.getPhotoDetail(photo.photoId, false);
      newPhoto.fromAlbum = photo.fromAlbum;
      Object.assign(photo, newPhoto);
    }
  }

  // 由JmUserClient实现的方法
  abstract login(username: string, password: string): void;
  abstract albumComment(videoId: string | number, comment: string, options?: any): JmAlbumCommentResp;
  abstract favoriteFolder(page?: number, orderBy?: string, folderId?: string, username?: string): JmFavoritePage;
  abstract addFavoriteAlbum(albumId: string | number, folderId?: string): void;

  // 由JmSearchAlbumClient实现的方法
  abstract search(searchQuery: string, page: number, mainTag: number, orderBy: string, time: string, category: string, subCategory: string | null): JmSearchPage;
  searchSite(searchQuery: string, page?: number, orderBy?: string, time?: string, category?: string, subCategory?: string | null): JmSearchPage {
    return this.search(searchQuery, page || 1, 0, orderBy || JmMagicConstants.ORDER_BY_LATEST, time || JmMagicConstants.TIME_ALL, category || JmMagicConstants.CATEGORY_ALL, subCategory || null);
  }
  searchWork(searchQuery: string, page?: number, orderBy?: string, time?: string, category?: string, subCategory?: string | null): JmSearchPage {
    return this.search(searchQuery, page || 1, 1, orderBy || JmMagicConstants.ORDER_BY_LATEST, time || JmMagicConstants.TIME_ALL, category || JmMagicConstants.CATEGORY_ALL, subCategory || null);
  }
  searchAuthor(searchQuery: string, page?: number, orderBy?: string, time?: string, category?: string, subCategory?: string | null): JmSearchPage {
    return this.search(searchQuery, page || 1, 2, orderBy || JmMagicConstants.ORDER_BY_LATEST, time || JmMagicConstants.TIME_ALL, category || JmMagicConstants.CATEGORY_ALL, subCategory || null);
  }
  searchTag(searchQuery: string, page?: number, orderBy?: string, time?: string, category?: string, subCategory?: string | null): JmSearchPage {
    return this.search(searchQuery, page || 1, 3, orderBy || JmMagicConstants.ORDER_BY_LATEST, time || JmMagicConstants.TIME_ALL, category || JmMagicConstants.CATEGORY_ALL, subCategory || null);
  }
  searchActor(searchQuery: string, page?: number, orderBy?: string, time?: string, category?: string, subCategory?: string | null): JmSearchPage {
    return this.search(searchQuery, page || 1, 4, orderBy || JmMagicConstants.ORDER_BY_LATEST, time || JmMagicConstants.TIME_ALL, category || JmMagicConstants.CATEGORY_ALL, subCategory || null);
  }

  // 由JmCategoryClient实现的方法
  abstract categoriesFilter(page: number, time: string, category: string, orderBy: string, subCategory?: string | null): JmCategoryPage;
  monthRanking(page: number, category?: string): JmCategoryPage {
    return this.categoriesFilter(page, JmMagicConstants.TIME_MONTH, category || JmMagicConstants.CATEGORY_ALL, JmMagicConstants.ORDER_BY_VIEW);
  }
  weekRanking(page: number, category?: string): JmCategoryPage {
    return this.categoriesFilter(page, JmMagicConstants.TIME_WEEK, category || JmMagicConstants.CATEGORY_ALL, JmMagicConstants.ORDER_BY_VIEW);
  }
  dayRanking(page: number, category?: string): JmCategoryPage {
    return this.categoriesFilter(page, JmMagicConstants.TIME_TODAY, category || JmMagicConstants.CATEGORY_ALL, JmMagicConstants.ORDER_BY_VIEW);
  }

  // JmcomicClient特有方法
  abstract getDomainList(): string[];
  abstract setDomainList(domainList: string[]): void;
  abstract setCacheDict(cacheDict: Dict | null): void;
  abstract getCacheDict(): Dict | null;
  abstract ofApiUrl(apiPath: string, domain: string): string;

  getHtmlDomain(): string {
    return JmModuleConfig.getHtmlDomain(this.get_root_postman());
  }

  getHtmlDomainAll(): string[] {
    return JmModuleConfig.getHtmlDomainAll(this.get_root_postman());
  }

  getHtmlDomainAllViaGithub(): string[] {
    return JmModuleConfig.getHtmlDomainAllViaGithub(this.get_root_postman());
  }

  *doPageIter<T extends JmPageContent>(
    params: Dict,
    page: number,
    getPageMethod: (...args: any[]) => T
  ): Generator<T, void, Dict | null> {
    const update = (value: Dict | null, currentPage: number, pageContent: JmPageContent): [number, number] => {
      if (value === null) {
        return [currentPage + 1, pageContent.pageCount];
      }

      ExceptionTool.requireTrue(typeof value === 'object', 'require dict params');

      // 根据外界传递的参数，更新params和page
      const newPage = value.page !== undefined ? value.page : currentPage;
      Object.assign(params, value);

      return [newPage, Number.POSITIVE_INFINITY];
    };

    let total = Number.POSITIVE_INFINITY;
    while (page <= total) {
      params.page = page;
      const pageContent = getPageMethod.call(this, params);
      const value = yield pageContent;
      [page, total] = update(value, page, pageContent);
    }
  }

  *favoriteFolderGen(
    page: number = 1,
    orderBy: string = JmMagicConstants.ORDER_BY_LATEST,
    folderId: string = '0',
    username: string = ''
  ): Generator<JmFavoritePage, void, Dict | null> {
    /**
     * 见 searchGen
     */
    const params: Dict = {
      orderBy,
      folderId,
      username
    };

    yield* this.doPageIter(params, page, (p: Dict) =>
      this.favoriteFolder(p.page, p.orderBy, p.folderId, p.username)
    );
  }

  *searchGen(
    searchQuery: string,
    mainTag: number = 0,
    page: number = 1,
    orderBy: string = JmMagicConstants.ORDER_BY_LATEST,
    time: string = JmMagicConstants.TIME_ALL,
    category: string = JmMagicConstants.CATEGORY_ALL,
    subCategory: string | null = null
  ): Generator<JmSearchPage, void, Dict | null> {
    /**
     * 搜索结果的生成器
     */
    const params: Dict = {
      searchQuery,
      mainTag,
      orderBy,
      time,
      category,
      subCategory
    };

    yield* this.doPageIter(params, page, (p: Dict) =>
      this.search(p.searchQuery, p.page, p.mainTag, p.orderBy, p.time, p.category, p.subCategory)
    );
  }

  *categoriesFilterGen(
    page: number = 1,
    time: string = JmMagicConstants.TIME_ALL,
    category: string = JmMagicConstants.CATEGORY_ALL,
    orderBy: string = JmMagicConstants.ORDER_BY_LATEST,
    subCategory: string | null = null
  ): Generator<JmCategoryPage, void, Dict | null> {
    /**
     * 见 searchGen
     */
    const params: Dict = {
      time,
      category,
      orderBy,
      subCategory
    };

    yield* this.doPageIter(params, page, (p: Dict) =>
      this.categoriesFilter(p.page, p.time, p.category, p.orderBy, p.subCategory)
    );
  }

  isGivenType(ctype: typeof JmcomicClient): boolean {
    /**
     * Client代理的此方法会被路由到内部client的方法
     * 即：ClientProxy(AClient()).isGivenType(AClient) is True
     * 但是: ClientProxy(AClient()).clientKey != AClient.clientKey
     */
    if (this instanceof ctype) {
      return true;
    }
    return (this.constructor as typeof JmcomicClient).clientKey === ctype.clientKey;
  }
}

export {
  JmResp,
  JmImageResp,
  JmJsonResp,
  JmApiResp,
  JmAlbumCommentResp,
  JmDetailClient,
  JmUserClient,
  JmImageClient,
  JmSearchAlbumClient,
  JmCategoryClient,
  JmcomicClient,
  JmMagicConstants,
  ExceptionTool,
  JmImageTool,
  JmCryptoTool,
  AdvancedDict
};
