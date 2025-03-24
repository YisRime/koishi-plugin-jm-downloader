import { Lock } from './utils/lock';
import { JmcomicText, JmMagicConstants, JmModuleConfig, JmCryptoTool, time_stamp, JmPageTool, parse_unicode_escape_text, PatternTool, ExceptionTool, jm_log, str_to_set, field_cache } from './jm_utils';
import { JmcomicClient, PostmanProxy, Postman } from './jm_client_interface';
import { JmImageResp, JmApiResp, JmResp, JmPhotoDetail, JmAlbumDetail, JmSearchPage, JmCategoryPage, JmFavoritePage, JmAlbumCommentResp } from './jm_types';
import { RequestRetryAllFailException } from './jm_exceptions';

// 抽象基类，实现了域名管理，发请求，重试机制，log，缓存等功能
abstract class AbstractJmClient implements JmcomicClient, PostmanProxy {
  client_key: string = '__just_for_placeholder_do_not_use_me__';
  func_to_cache: string[] = [];

  private postman: Postman;
  private retry_times: number;
  private domain_list: string[];
  private CLIENT_CACHE: Map<any, any> | null = null;
  protected _username: string | null = null;  // help for favorite_folder method

  constructor(
    postman: Postman,
    domain_list: string[],
    retry_times: number = 0,
  ) {
    /**
     * 创建JM客户端
     *
     * @param postman: 负责实现HTTP请求的对象，持有cookies、headers、proxies等信息
     * @param domain_list: 禁漫域名
     * @param retry_times: 重试次数
     */
    this.postman = postman;
    this.retry_times = retry_times;
    this.domain_list = domain_list;
    this.CLIENT_CACHE = null;
    this._username = null;
    this.enable_cache();
    this.after_init();
  }

  after_init(): void {
    // To be overridden by subclasses
  }

  async get(url: string, options?: any): Promise<any> {
    return this.request_with_retry(this.postman.get.bind(this.postman), url, options);
  }

  async post(url: string, options?: any): Promise<any> {
    return this.request_with_retry(this.postman.post.bind(this.postman), url, options);
  }

  of_api_url(api_path: string, domain: string): string {
    return JmcomicText.format_url(api_path, domain);
  }

  async get_jm_image(img_url: string): Promise<JmImageResp> {
    const callback = (resp: any): JmImageResp => {
      /**
       * 使用此方法包装 self.get，使得图片数据为空时，判定为请求失败时，走重试逻辑
       */
      const imageResp = new JmImageResp(resp);
      imageResp.require_success();
      return imageResp;
    };

    return await this.get(img_url, {
      callback,
      headers: JmModuleConfig.new_html_headers()
    });
  }

  async request_with_retry(
    request: Function,
    url: string,
    options: any = {},
    domain_index: number = 0,
    retry_count: number = 0,
  ): Promise<any> {
    /**
     * 支持重试和切换域名的机制
     *
     * 如果url包含了指定域名，则不会切换域名，例如图片URL。
     *
     * 如果需要拿到域名进行回调处理，可以重写 self.update_request_with_specify_domain 方法，例如更新headers
     */
    if (domain_index >= this.domain_list.length) {
      return this.fallback(request, url, domain_index, retry_count, options);
    }

    const url_backup = url;
    let callback = options?.callback;

    if (url.startsWith('/')) {
      // path → url
      const domain = this.domain_list[domain_index];
      url = this.of_api_url(url, domain);

      this.update_request_with_specify_domain(options || {}, domain);

      jm_log(this.log_topic(), this.decode(url));
    } else {
      // 图片url
      this.update_request_with_specify_domain(options || {}, null, true);
    }

    if (domain_index !== 0 || retry_count !== 0) {
      jm_log('req.retry',
        [
          `次数: [${retry_count}/${this.retry_times}]`,
          `域名: [${domain_index} of ${this.domain_list.length}]`,
          `路径: [${url}]`,
          `参数: [${url.includes('login') ? "#login_form#" : JSON.stringify(options)}]`
        ].join(', ')
      );
    }

    try {
      let resp = await request(url, options);

      // 回调，可以接收resp返回新的resp，也可以抛出异常强制重试
      if (callback) {
        resp = callback(resp);
      }

      // 依然是回调，在最后返回之前，还可以判断resp是否重试
      resp = this.raise_if_resp_should_retry(resp);

      return resp;
    } catch (e) {
      if (this.retry_times === 0) {
        throw e;
      }

      this.before_retry(e, options, retry_count, url);
    }

    if (retry_count < this.retry_times) {
      return this.request_with_retry(request, url_backup, options, domain_index, retry_count + 1);
    } else {
      return this.request_with_retry(request, url_backup, options, domain_index + 1, 0);
    }
  }

  raise_if_resp_should_retry(resp: any): any {
    /**
     * 依然是回调，在最后返回之前，还可以判断resp是否重试
     */
    return resp;
  }

  update_request_with_specify_domain(options: any, domain: string | null, is_image: boolean = false): void {
    /**
     * 域名自动切换时，用于更新请求参数的回调
     */
  }

  log_topic(): string {
    return this.client_key;
  }

  before_retry(e: any, options: any, retry_count: number, url: string): void {
    jm_log('req.error', String(e));
  }

  enable_cache(): void {
    if (!this.CLIENT_CACHE) {
      this.CLIENT_CACHE = new Map();
    }

    // 为需要缓存的函数创建包装器
    for (const func_name of this.func_to_cache) {
      const original_func = (this as any)[func_name];
      if (original_func) {
        (this as any)[func_name] = async (...args: any[]) => {
          if (!this.CLIENT_CACHE) {
            return await original_func.apply(this, args);
          }

          // 简单的缓存键创建
          const key = JSON.stringify(args);

          if (this.CLIENT_CACHE.has(key)) {
            return this.CLIENT_CACHE.get(key);
          }

          const result = await original_func.apply(this, args);
          this.CLIENT_CACHE.set(key, result);
          return result;
        };
      }
    }
  }

  set_cache_dict(cache_dict: Map<any, any> | null): void {
    this.CLIENT_CACHE = cache_dict;
  }

  get_cache_dict(): Map<any, any> | null {
    return this.CLIENT_CACHE;
  }

  get_domain_list(): string[] {
    return this.domain_list;
  }

  set_domain_list(domain_list: string[]): void {
    this.domain_list = domain_list;
  }

  async fallback(request: Function, url: string, domain_index: number, retry_count: number, options: any): Promise<any> {
    const msg = `请求重试全部失败: [${url}], ${this.domain_list}`;
    jm_log('req.fallback', msg);
    ExceptionTool.raises(msg, {}, RequestRetryAllFailException);
    return null; // TypeScript需要返回值
  }

  append_params_to_url(url: string, params: Record<string, any>): string {
    // 将参数对象转换为查询字符串
    const query_string = new URLSearchParams(params).toString();
    return `${url}?${query_string}`;
  }

  decode(url: string): string {
    if (!JmModuleConfig.FLAG_DECODE_URL_WHEN_LOGGING || !url.includes('/search/')) {
      return url;
    }

    try {
      return decodeURIComponent(url.replace(/\+/g, ' '));
    } catch (e) {
      return url;
    }
  }

  // 索引签名支持，用于设置元数据如cookies
  [key: string]: any;
}

// 基于网页实现的JmClient
class JmHtmlClient extends AbstractJmClient {
  client_key: string = 'html';
  func_to_cache: string[] = ['search', 'fetch_detail_entity'];

  static API_SEARCH: string = '/search/photos';
  static API_CATEGORY: string = '/albums';

  async add_favorite_album(
    album_id: string | number,
    folder_id: string = '0',
  ): Promise<any> {
    const data = {
      album_id,
      fid: folder_id,
    };

    const resp = await this.get_jm_html(
      '/ajax/favorite_album',
      { data }
    );

    const res = await resp.json();

    if (res.status !== 1) {
      const msg = parse_unicode_escape_text(res.msg);
      const error_msg = PatternTool.match_or_default(msg, JmcomicText.pattern_ajax_favorite_msg, msg);
      // 此圖片已經在您最喜愛的清單！

      this.raise_request_error(
        resp,
        error_msg
      );
    }

    return resp;
  }

  async get_album_detail(album_id: string | number): Promise<JmAlbumDetail> {
    return await this.fetch_detail_entity(album_id, 'album');
  }

  async get_photo_detail(
    photo_id: string | number,
    fetch_album: boolean = true,
    fetch_scramble_id: boolean = true,
  ): Promise<JmPhotoDetail> {
    const photo = await this.fetch_detail_entity(photo_id, 'photo');

    // 一并获取该章节的所处本子
    if (fetch_album === true) {
      photo.from_album = await this.get_album_detail(photo.album_id);
    }

    return photo;
  }

  async fetch_detail_entity(jmid: string | number, prefix: string): Promise<any> {
    // 参数校验
    jmid = JmcomicText.parse_to_jm_id(jmid);

    // 请求
    const resp = await this.get_jm_html(`/${prefix}/${jmid}`);

    // 用 JmcomicText 解析 html，返回实体类
    if (prefix === 'album') {
      return JmcomicText.analyse_jm_album_html(resp.text);
    }

    if (prefix === 'photo') {
      return JmcomicText.analyse_jm_photo_html(resp.text);
    }

    return null;
  }

  async search(
    search_query: string,
    page: number,
    main_tag: number,
    order_by: string,
    time: string,
    category: string,
    sub_category: string | null,
  ): Promise<JmSearchPage> {
    /**
     * 网页搜索API
     */
    const params = {
      main_tag,
      search_query,
      page,
      o: order_by,
      t: time,
    };

    const url = JmHtmlClient.build_search_url(JmHtmlClient.API_SEARCH, category, sub_category);

    const resp = await this.get_jm_html(
      this.append_params_to_url(url, params),
      { allow_redirects: true }
    );

    // 检查是否发生了重定向
    // 因为如果搜索的是禁漫车号，会直接跳转到本子详情页面
    if (resp.redirect_count !== 0 && resp.url.includes('/album/')) {
      const album = JmcomicText.analyse_jm_album_html(resp.text);
      return JmSearchPage.wrap_single_album(album);
    } else {
      return JmPageTool.parse_html_to_search_page(resp.text);
    }
  }

  static build_search_url(base: string, category: string, sub_category: string | null): string {
    /**
     * 构建网页搜索/分类的URL
     *
     * 示例：
     * @param base: "/search/photos"
     * @param category CATEGORY_DOUJIN
     * @param sub_category SUB_DOUJIN_CG
     * @return "/search/photos/doujin/sub/CG"
     */
    if (category === JmMagicConstants.CATEGORY_ALL) {
      return base;
    }

    if (sub_category === null) {
      return `${base}/${category}`;
    } else {
      return `${base}/${category}/sub/${sub_category}`;
    }
  }

  async categories_filter(
    page: number,
    time: string,
    category: string,
    order_by: string,
    sub_category: string | null = null,
  ): Promise<JmCategoryPage> {
    const params = {
      page,
      o: order_by,
      t: time,
    };

    const url = JmHtmlClient.build_search_url(JmHtmlClient.API_CATEGORY, category, sub_category);

    const resp = await this.get_jm_html(
      this.append_params_to_url(url, params),
      { allow_redirects: true }
    );

    return JmPageTool.parse_html_to_category_page(resp.text);
  }

  // -- 帐号管理 --

  async login(
    username: string,
    password: string,
    id_remember: string = 'on',
    login_remember: string = 'on',
  ): Promise<any> {
    /**
     * 返回response响应对象
     */
    const data = {
      username,
      password,
      id_remember,
      login_remember,
      submit_login: '',
    };

    const resp = await this.post('/login', {
      data,
      allow_redirects: false,
    });

    if (resp.status_code !== 200) {
      ExceptionTool.raises_resp(`登录失败，状态码为${resp.status_code}`, resp);
    }

    const orig_cookies = this.get_meta_data('cookies') || {};
    const new_cookies = resp.cookies || {};

    // 重复登录下存在bug，AVS会丢失
    if ('AVS' in orig_cookies && !('AVS' in new_cookies)) {
      return resp;
    }

    this['cookies'] = new_cookies;
    this._username = username;

    return resp;
  }

  async favorite_folder(
    page: number = 1,
    order_by: string = JmMagicConstants.ORDER_BY_LATEST,
    folder_id: string = '0',
    username: string = '',
  ): Promise<JmFavoritePage> {
    if (username === '') {
      ExceptionTool.require_true(this._username !== null, 'favorite_folder方法需要传username参数');
      username = this._username!;
    }

    const resp = await this.get_jm_html(
      `/user/${username}/favorite/albums`,
      {
        params: {
          page,
          o: order_by,
          folder_id,
        }
      }
    );

    return JmPageTool.parse_html_to_favorite_page(resp.text);
  }

  get_username_from_cookies(): string | null {
    // 解析cookies，可能需要用到 phpserialize，比较麻烦，暂不实现
    return null;
  }

  async get_jm_html(url: string, options: any = {}, require_200: boolean = true): Promise<any> {
    /**
     * 请求禁漫网页的入口
     */
    const resp = await this.get(url, options);

    if (require_200 === true && resp.status_code !== 200) {
      // 检查是否是特殊的状态码
      // 如果是，直接抛出异常
      JmHtmlClient.check_special_http_code(resp);
      // 运行到这里说明上一步没有抛异常，说明是未知状态码，抛异常兜底处理
      this.raise_request_error(resp);
    }

    // 检查请求是否成功
    JmHtmlClient.require_resp_success_else_raise(resp, url);

    return resp;
  }

  update_request_with_specify_domain(options: any, domain: string | null, is_image: boolean = false): void {
    if (is_image) {
      return;
    }

    const latest_headers = options.headers || {};
    const base_headers = this.get_meta_data('headers', null) || JmModuleConfig.new_html_headers(domain);
    options.headers = { ...base_headers, ...latest_headers };
  }

  static raise_request_error(resp: any, msg?: string): void {
    /**
     * 请求如果失败，统一由该方法抛出异常
     */
    if (!msg) {
      const respText = resp.text || '';
      msg = `请求失败，` +
            `响应状态码为${resp.status_code}，` +
            `URL=[${resp.url}]，` +
            (respText.length < 200 ?
              `响应文本=[${respText}]` :
              `响应文本过长(len=${respText.length})，不打印`);
    }

    ExceptionTool.raises_resp(msg, resp);
  }

  async album_comment(
    video_id: string | number,
    comment: string,
    originator: string = '',
    status: string = 'true',
    comment_id: string | null = null,
    options: any = {},
  ): Promise<JmAlbumCommentResp> {
    const data: Record<string, any> = {
      video_id,
      comment,
      originator,
      status,
    };

    // 处理回复评论
    if (comment_id !== null) {
      delete data.status;
      data.comment_id = comment_id;
      data.is_reply = 1;
      data.forum_subject = 1;
    }

    jm_log('album.comment',
      `${video_id}: [${comment}]` +
      (comment_id !== null ? ` to (${comment_id})` : '')
    );

    const resp = await this.post('/ajax/album_comment', { data });

    const ret = new JmAlbumCommentResp(resp);
    jm_log('album.comment', `${video_id}: [${comment}] ← (${ret.model().cid})`);

    return ret;
  }

  get_meta_data(key: string, defaultValue: any = null): any {
    return this[key] || defaultValue;
  }

  static require_resp_success_else_raise(resp: any, url: string): void {
    /**
     * @param resp: 响应对象
     * @param url: /photo/12412312
     */
    const resp_url: string = resp.url;

    // 1. 是否是特殊的内容
    JmHtmlClient.check_special_text(resp);

    // 2. 检查响应发送重定向，重定向url是否表示错误网页，即 /error/xxx
    if (resp.redirect_count === 0 || !resp_url.includes('/error/')) {
      return;
    }

    // 3. 检查错误类型
    const match_case = (error_path: string) => {
      return resp_url.endsWith(error_path) && !url.endsWith(error_path);
    };

    // 3.1 album_missing
    if (match_case('/error/album_missing')) {
      ExceptionTool.raise_missing(resp, JmcomicText.parse_to_jm_id(url));
    }

    // 3.2 user_missing
    if (match_case('/error/user_missing')) {
      ExceptionTool.raises_resp('此用戶名稱不存在，或者你没有登录，請再次確認使用名稱', resp);
    }

    // 3.3 invalid_module
    if (match_case('/error/invalid_module')) {
      ExceptionTool.raises_resp('發生了無法預期的錯誤。若問題持續發生，請聯繫客服支援', resp);
    }
  }

  static check_special_text(resp: any): void {
    const html = resp.text || '';
    const url = resp.url;

    if (html.length > 500) {
      return;
    }

    for (const [content, reason] of Object.entries(JmModuleConfig.JM_ERROR_RESPONSE_TEXT)) {
      if (!html.includes(content)) {
        continue;
      }

      JmHtmlClient.raise_request_error(
        resp,
        `${reason}${url ? ': ' + url : ''}`
      );
    }
  }

  static check_special_http_code(resp: any): void {
    const code = resp.status_code;
    const url = resp.url;

    const error_msg = JmModuleConfig.JM_ERROR_STATUS_CODE[code];
    if (!error_msg) {
      return;
    }

    JmHtmlClient.raise_request_error(
      resp,
      `请求失败，` +
      `响应状态码为${code}，` +
      `原因为: [${error_msg}], ` +
      (url ? `URL=[${url}]` : '')
    );
  }
}

// 基于禁漫移动端（APP）实现的JmClient
class JmApiClient extends AbstractJmClient {
  client_key: string = 'api';
  func_to_cache: string[] = ['search', 'fetch_detail_entity'];

  static API_SEARCH: string = '/search';
  static API_CATEGORIES_FILTER: string = '/categories/filter';
  static API_ALBUM: string = '/album';
  static API_CHAPTER: string = '/chapter';
  static API_SCRAMBLE: string = '/chapter_view_template';
  static API_FAVORITE: string = '/favorite';

  async search(
    search_query: string,
    page: number,
    main_tag: number,
    order_by: string,
    time: string,
    category: string,
    sub_category: string | null,
  ): Promise<JmSearchPage> {
    /**
     * 移动端暂不支持 category和sub_category
     */
    const params = {
      main_tag,
      search_query,
      page,
      o: order_by,
      t: time,
    };

    const resp = await this.req_api(this.append_params_to_url(JmApiClient.API_SEARCH, params));

    // 直接搜索禁漫车号，发生重定向的响应数据
    const data = resp.model_data;
    if (data.redirect_aid) {
      const aid = data.redirect_aid;
      return JmSearchPage.wrap_single_album(await this.get_album_detail(aid));
    }

    return JmPageTool.parse_api_to_search_page(data);
  }

  async categories_filter(
    page: number,
    time: string,
    category: string,
    order_by: string,
    sub_category: string | null = null,
  ): Promise<JmCategoryPage> {
    /**
     * 移动端不支持 sub_category
     */
    // o: mv, mv_m, mv_w, mv_t
    const o = time !== JmMagicConstants.TIME_ALL ? `${order_by}_${time}` : order_by;

    const params = {
      page,
      order: '',  // 该参数为空
      c: category,
      o,
    };

    const resp = await this.req_api(this.append_params_to_url(JmApiClient.API_CATEGORIES_FILTER, params));

    return JmPageTool.parse_api_to_search_page(resp.model_data);
  }

  async get_album_detail(album_id: string | number): Promise<JmAlbumDetail> {
    return this.fetch_detail_entity(album_id, JmModuleConfig.album_class());
  }

  async get_photo_detail(
    photo_id: string | number,
    fetch_album: boolean = true,
    fetch_scramble_id: boolean = true,
  ): Promise<JmPhotoDetail> {
    const photo: JmPhotoDetail = await this.fetch_detail_entity(photo_id, JmModuleConfig.photo_class());

    if (fetch_album || fetch_scramble_id) {
      await this.fetch_photo_additional_field(photo, fetch_album, fetch_scramble_id);
    }

    return photo;
  }

  async get_scramble_id(photo_id: string | number, album_id?: string | number): Promise<string> {
    /**
     * 带有缓存的fetch_scramble_id，缓存位于 JmModuleConfig.SCRAMBLE_CACHE
     */
    const cache = JmModuleConfig.SCRAMBLE_CACHE;
    const photoIdStr = String(photo_id);

    if (photoIdStr in cache) {
      return cache[photoIdStr];
    }

    if (album_id && String(album_id) in cache) {
      return cache[String(album_id)];
    }

    const scramble_id = await this.fetch_scramble_id(photo_id);
    cache[photoIdStr] = scramble_id;

    if (album_id) {
      cache[String(album_id)] = scramble_id;
    }

    return scramble_id;
  }

  async fetch_detail_entity(jmid: string | number, clazz: any): Promise<any> {
    /**
     * 请求实体类
     */
    jmid = JmcomicText.parse_to_jm_id(jmid);
    const url = clazz.prototype instanceof JmAlbumDetail ? JmApiClient.API_ALBUM : JmApiClient.API_CHAPTER;

    const resp = await this.req_api(this.append_params_to_url(
      url,
      { id: jmid }
    ));

    if (!resp.res_data.name) {
      ExceptionTool.raise_missing(resp, jmid);
    }

    return JmApiAdaptTool.parse_entity(resp.res_data, clazz);
  }

  async fetch_scramble_id(photo_id: string | number): Promise<string> {
    /**
     * 请求scramble_id
     */
    photo_id = JmcomicText.parse_to_jm_id(photo_id);
    const resp = await this.req_api(
      JmApiClient.API_SCRAMBLE,
      {
        params: {
          id: photo_id,
          mode: 'vertical',
          page: '0',
          app_img_shunt: '1',
          express: 'off',
          v: time_stamp(),
        },
        require_success: false,
      }
    );

    let scramble_id = PatternTool.match_or_default(
      resp.text,
      JmcomicText.pattern_html_album_scramble_id,
      null
    );

    if (!scramble_id) {
      jm_log('api.scramble', `未匹配到scramble_id，响应文本：${resp.text}`);
      scramble_id = String(JmMagicConstants.SCRAMBLE_220980);
    }

    return scramble_id;
  }

  async fetch_photo_additional_field(
    photo: JmPhotoDetail,
    fetch_album: boolean,
    fetch_scramble_id: boolean
  ): Promise<void> {
    /**
     * 获取章节的额外信息
     * 1. scramble_id
     * 2. album
     */
    if (fetch_album) {
      photo.from_album = await this.get_album_detail(photo.album_id);
    }

    if (fetch_scramble_id) {
      // 同album的scramble_id相同
      photo.scramble_id = await this.get_scramble_id(photo.photo_id, photo.album_id);
    }
  }

  async setting(): Promise<JmApiResp> {
    /**
     * 禁漫app的setting请求
     */
    const resp = await this.req_api('/setting');

    // 检查禁漫最新的版本号
    const setting_ver = String(resp.model_data.version);
    // 禁漫接口的版本 > jmcomic库内置版本
    if (setting_ver > JmMagicConstants.APP_VERSION && JmModuleConfig.FLAG_USE_VERSION_NEWER_IF_BEHIND) {
      jm_log('api.setting', `change APP_VERSION from [${JmMagicConstants.APP_VERSION}] to [${setting_ver}]`);
      JmMagicConstants.APP_VERSION = setting_ver;
    }

    return resp;
  }

  async login(
    username: string,
    password: string,
  ): Promise<JmApiResp> {
    const resp = await this.req_api('/login', {
      get: false,
      data: {
        username,
        password,
      }
    });

    const cookies = { ...resp.resp.cookies, AVS: resp.res_data.s };
    this['cookies'] = cookies;

    return resp;
  }

  async favorite_folder(
    page: number = 1,
    order_by: string = JmMagicConstants.ORDER_BY_LATEST,
    folder_id: string = '0',
    username: string = '',
  ): Promise<JmFavoritePage> {
    const resp = await this.req_api(
      JmApiClient.API_FAVORITE,
      {
        params: {
          page,
          folder_id,
          o: order_by,
        }
      }
    );

    return JmPageTool.parse_api_to_favorite_page(resp.model_data);
  }

  async add_favorite_album(
    album_id: string | number,
    folder_id: string = '0',
  ): Promise<JmApiResp> {
    /**
     * 移动端没有提供folder_id参数
     */
    const resp = await this.req_api(
      '/favorite',
      {
        data: {
          aid: album_id,
        },
      }
    );

    this.require_resp_status_ok(resp);

    return resp;
  }

  require_resp_status_ok(resp: JmApiResp): void {
    /**
     * 检查返回数据中的status字段是否为ok
     */
    const data = resp.model_data;
    if (data.status === 'ok') {
      ExceptionTool.raises_resp(data.msg, resp);
    }
  }

  async req_api(url: string, options: any = {}): Promise<JmApiResp> {
    const get = options.get !== false;
    const require_success = options.require_success !== false;

    const ts = this.decide_headers_and_ts(options, url);

    let resp;
    if (get) {
      resp = await this.get(url, options);
    } else {
      resp = await this.post(url, options);
    }

    const apiResp = new JmApiResp(resp, ts);

    if (require_success) {
      JmApiClient.require_resp_success(apiResp, url);
    }

    return apiResp;
  }

  update_request_with_specify_domain(options: any, domain: string | null, is_image: boolean = false): void {
    if (is_image) {
      // 设置APP端的图片请求headers
      options.headers = { ...JmModuleConfig.APP_HEADERS_TEMPLATE, ...JmModuleConfig.APP_HEADERS_IMAGE };
    }
  }

  decide_headers_and_ts(options: any, url: string): number {
    let ts: number;
    let token: string;
    let tokenparam: string;

    // 获取时间戳
    if (url === JmApiClient.API_SCRAMBLE) {
      // /chapter_view_template
      // 这个接口很特殊，用的密钥 18comicAPPContent 而不是 18comicAPP
      ts = time_stamp();
      const tokenObj = JmCryptoTool.token_and_tokenparam(ts, JmMagicConstants.APP_TOKEN_SECRET_2);
      token = tokenObj.token;
      tokenparam = tokenObj.tokenparam;

    } else if (JmModuleConfig.FLAG_USE_FIX_TIMESTAMP) {
      const fixTs = JmModuleConfig.get_fix_ts_token_tokenparam();
      ts = fixTs.ts;
      token = fixTs.token;
      tokenparam = fixTs.tokenparam;

    } else {
      ts = time_stamp();
      const tokenObj = JmCryptoTool.token_and_tokenparam(ts);
      token = tokenObj.token;
      tokenparam = tokenObj.tokenparam;
    }

    // 设置headers
    options.headers = options.headers || {};
    options.headers = {
      ...JmModuleConfig.APP_HEADERS_TEMPLATE,
      ...options.headers,
      token,
      tokenparam,
    };

    return ts;
  }

  static require_resp_success(resp: JmApiResp, url: string | null = null): void {
    /**
     * @param resp: 响应对象
     * @param url: 请求路径，例如 /setting
     */
    resp.require_success();

    // 1. 检查是否 album_missing
    // json: {'code': 200, 'data': []}
    const data = resp.model().data;
    if (Array.isArray(data) && data.length === 0) {
      ExceptionTool.raise_missing(resp, JmcomicText.parse_to_jm_id(url || ''));
    }

    // 2. 是否是特殊的内容
    // 暂无
  }

  raise_if_resp_should_retry(resp: any): any {
    /**
     * 该方法会判断resp返回值是否是json格式，
     * 如果不是，大概率是禁漫内部异常，需要进行重试
     *
     * 由于完整的json格式校验会有性能开销，所以只做简单的检查，
     * 只校验第一个有效字符是不是 '{'，如果不是，就认为异常数据，需要重试
     */
    if (resp instanceof JmResp) {
      // 不对包装过的resp对象做校验，包装者自行校验
      // 例如图片请求
      return resp;
    }

    const code = resp.status_code;
    if (code >= 500) {
      const msg = JmModuleConfig.JM_ERROR_STATUS_CODE[code] || `HTTP状态码: ${code}`;
      ExceptionTool.raises_resp(`禁漫API异常响应, ${msg}`, resp);
    }

    const url = resp.request?.url;

    if (url && url.includes(JmApiClient.API_SCRAMBLE)) {
      // /chapter_view_template 这个接口不是返回json数据，不做检查
      return resp;
    }

    const text = resp.text;
    for (const char of text) {
      if (char !== ' ' && char !== '\n' && char !== '\t') {
        // 找到第一个有效字符
        ExceptionTool.require_true(
          char === '{',
          `请求不是json格式，强制重试！响应文本: [${resp.text}]`
        );
        return resp;
      }
    }

    ExceptionTool.raises_resp(`响应无数据！request_url=[${url}]`, resp);
    return resp;
  }

  after_init(): void {
    // 保证拥有cookies，因为移动端要求必须携带cookies，否则会直接跳转同一本子【禁漫娘】
    if (JmModuleConfig.FLAG_API_CLIENT_REQUIRE_COOKIES) {
      this.ensure_have_cookies();
    }
  }

  private static client_init_cookies_lock = new Lock();

  ensure_have_cookies(): void {
    if (this.get_meta_data('cookies')) {
      return;
    }

    JmApiClient.client_init_cookies_lock.acquire();
    try {
      if (this.get_meta_data('cookies')) {
        return;
      }

      this['cookies'] = this.get_cookies();
    } finally {
      JmApiClient.client_init_cookies_lock.release();
    }
  }

  @field_cache("APP_COOKIES", JmModuleConfig)
  get_cookies(): any {
    const resp = this.setting();
    return resp.resp.cookies;
  }
}

class PhotoConcurrentFetcherProxy implements JmcomicClient {
  client_key: string = 'photo_concurrent_fetcher_proxy';

  private client: JmcomicClient;
  private executors: any;
  private future_dict: Map<string, PhotoConcurrentFetcherProxy.FutureWrapper>;
  private lock: Lock;

  constructor(
    client: JmcomicClient,
    max_workers: number | null = null,
    executors: any = null,
  ) {
    this.client = client;
    this.route_notimpl_method_to_internal_client(client);

    if (!executors) {
      // 在实际实现中需要创建一个线程池
      executors = {
        submit: (task: Function) => {
          return {
            result: () => task()
          };
        }
      };
    }

    this.executors = executors;
    this.future_dict = new Map();
    this.lock = new Lock();
  }

  route_notimpl_method_to_internal_client(client: JmcomicClient): void {
    const proxy_methods = str_to_set(`
      get_album_detail
      get_photo_detail
    `);

    // 获取对象的所有属性和方法的名称列表
    for (const method of Object.getOwnPropertyNames(Object.getPrototypeOf(client))) {
      // 判断是否为方法（可调用对象）
      if (!method.startsWith('_')
          && typeof (client as any)[method] === 'function'
          && !proxy_methods.has(method)
      ) {
        (this as any)[method] = (client as any)[method].bind(client);
      }
    }
  }

  async get_album_detail(album_id: string | number): Promise<JmAlbumDetail> {
    album_id = JmcomicText.parse_to_jm_id(album_id);
    const cache_key = `album_${album_id}`;
    const future = this.get_future(cache_key, () => this.client.get_album_detail(album_id));
    return future.result();
  }

  get_future(cache_key: string, task: Function): PhotoConcurrentFetcherProxy.FutureWrapper {
    if (this.future_dict.has(cache_key)) {
      // cache hit, means that a same task is running
      return this.future_dict.get(cache_key)!;
    }

    this.lock.acquire();
    try {
      if (this.future_dict.has(cache_key)) {
        return this.future_dict.get(cache_key)!;
      }

      // after future done, remove it from future_dict.
      // cache depends on self.client instead of self.future_dict
      const future = new PhotoConcurrentFetcherProxy.FutureWrapper(
        this.executors.submit(task),
        () => this.future_dict.delete(cache_key)
      );

      this.future_dict.set(cache_key, future);
      return future;
    } finally {
      this.lock.release();
    }
  }

  async get_photo_detail(
    photo_id: string | number,
    fetch_album: boolean = true,
    fetch_scramble_id: boolean = true
  ): Promise<JmPhotoDetail> {
    photo_id = JmcomicText.parse_to_jm_id(photo_id);
    const client: JmcomicClient = this.client;
    const futures: (PhotoConcurrentFetcherProxy.FutureWrapper | null)[] = [null, null, null];
    const results: any[] = [null, null, null];

    // photo_detail
    const photo_future = this.get_future(
      `photo_${photo_id}`,
      () => client.get_photo_detail(photo_id, false, false)
    );
    futures[0] = photo_future;

    // fetch_album
    if (fetch_album) {
      const album_future = this.get_future(
        `album_${photo_id}`,
        () => client.get_album_detail(photo_id)
      );
      futures[1] = album_future;
    } else {
      results[1] = null;
    }

    // fetch_scramble_id
    if (fetch_scramble_id && client instanceof JmApiClient) {
      const apiClient = client as JmApiClient;
      const scramble_future = this.get_future(
        `scramble_id_${photo_id}`,
        () => apiClient.get_scramble_id(photo_id)
      );
      futures[2] = scramble_future;
    } else {
      results[2] = '';
    }

    // wait finish
    for (let i = 0; i < futures.length; i++) {
      const f = futures[i];
      if (!f) {
        continue;
      }
      results[i] = await f.result();
    }

    // compose
    const photo: JmPhotoDetail = results[0];
    const album = results[1];
    const scramble_id = results[2];

    if (album !== null) {
      photo.from_album = album;
    }
    if (scramble_id !== '') {
      photo.scramble_id = scramble_id;
    }

    return photo;
  }

  // 定义内部类 FutureWrapper
  static FutureWrapper = class {
    private future: any;
    private done: boolean;
    private _result: any;
    private after_done_callback: Function;

    constructor(future: any, after_done_callback: Function) {
      this.future = future;
      this.done = false;
      this._result = null;
      this.after_done_callback = after_done_callback;
    }

    async result(): Promise<any> {
      if (!this.done) {
        this._result = await this.future.result();
        this.done = true;
        this.future = null; // help gc
        this.after_done_callback();
      }

      return this._result;
    }
  };
}

export {
  AbstractJmClient,
  JmHtmlClient,
  JmApiClient,
  PhotoConcurrentFetcherProxy
};
