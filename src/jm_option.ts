import * as fs from 'fs';
import * as path from 'path';

// 基础接口定义
interface JmAlbumDetail {
  // 为简化实现，这里仅声明基本属性
  [key: string]: any;
}

interface JmPhotoDetail {
  from_album: JmAlbumDetail;
  [key: string]: any;
}

interface JmImageDetail {
  from_photo: JmPhotoDetail;
  filename_without_suffix: string;
  img_file_suffix: string;
  is_gif: boolean;
  [key: string]: any;
}

interface JmcomicClient {
  client_key: string;
  set_cache_dict(cache: Record<string, any>): void;
}

abstract class AbstractJmClient implements JmcomicClient {
  abstract client_key: string;
  abstract set_cache_dict(cache: Record<string, any>): void;
}

class JmHtmlClient extends AbstractJmClient {
  static client_key: string = 'html';
  client_key: string = 'html';
  private postman: any;
  private domain_list: string[];
  private retry_times: number;

  constructor(postman: any, domain_list: string[], retry_times: number) {
    super();
    this.postman = postman;
    this.domain_list = domain_list;
    this.retry_times = retry_times;
  }

  set_cache_dict(cache: Record<string, any>): void {
    // 实现缓存设置
  }
}

class JmApiClient extends AbstractJmClient {
  static client_key: string = 'api';
  client_key: string = 'api';
  private postman: any;
  private domain_list: string[];
  private retry_times: number;

  constructor(postman: any, domain_list: string[], retry_times: number) {
    super();
    this.postman = postman;
    this.domain_list = domain_list;
    this.retry_times = retry_times;
  }

  set_cache_dict(cache: Record<string, any>): void {
    // 实现缓存设置
  }
}

class JmModuleConfig {
  static readonly JM_OPTION_VER: string = '1.0';
  static readonly FLAG_ENABLE_JM_LOG: boolean = true;
  static readonly DOMAIN_API_LIST: string[] = ['18comic.vip'];
  static readonly DOMAIN_HTML_LIST: string[] = ['18comic.org'];
  static readonly REGISTRY_PLUGIN: Record<string, any> = {};

  static option_default_dict(): Record<string, any> {
    return {
      dir_rule: {
        rule: 'Bd_Aid_Pindex',
        base_dir: './download'
      },
      download: {
        cache: true,
        threading: {
          image: 3,
          photo: 2
        },
        image: {
          decode: true,
          suffix: '.jpg'
        }
      },
      client: {
        impl: 'html',
        retry_times: 3,
        cache: 'level_option',
        domain: [],
        postman: {
          meta_data: {}
        }
      },
      plugins: {
        valid: 'log'
      }
    };
  }

  static client_impl_class(impl: string): typeof AbstractJmClient {
    if (impl === 'html') return JmHtmlClient;
    if (impl === 'api') return JmApiClient;
    return AbstractJmClient;
  }

  static get_html_domain(): string {
    return this.DOMAIN_HTML_LIST[0];
  }
}

class AdvancedDict {
  src_dict: Record<string, any>;

  constructor(dict: Record<string, any>) {
    this.src_dict = dict || {};
  }

  get(key: string, defaultValue?: any): any {
    return key in this.src_dict ? this.src_dict[key] : defaultValue;
  }
}

class JmcomicText {
  static parse_to_abspath(p: string): string {
    if (!p) return '';
    return path.resolve(p);
  }

  static try_mkdir(dir: string): string {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  static parse_dsl_text(text: string): any {
    // DSL文本解析实现
    return text;
  }
}

class ExceptionTool {
  static require_true(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(message);
    }
  }

  static raises(message: string): never {
    throw new Error(message);
  }
}

class DetailEntity {
  static get_dirname(detail: JmAlbumDetail | JmPhotoDetail, field: string): string {
    if (!detail) return '';
    return detail[field] || '';
  }
}

class PackerUtil {
  static unpack(filepath: string): [Record<string, any>, any] {
    try {
      const content = fs.readFileSync(filepath, 'utf8');
      return [JSON.parse(content), null];
    } catch (e) {
      console.error(`无法解析文件 ${filepath}: ${e}`);
      return [{}, e];
    }
  }

  static pack(data: Record<string, any>, filepath: string): void {
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  }
}

class Postmans {
  static create(data: Record<string, any>): any {
    // 简化实现，仅返回数据
    return data;
  }
}

// 实用函数
function fix_filepath(filepath: string, is_dir: boolean = false): string {
  let result = filepath.replace(/[<>:"|?*]/g, '_');
  if (is_dir && !result.endsWith('/') && !result.endsWith('\\')) {
    result += '/';
  }
  return result;
}

function fix_windir_name(name: string): string {
  return name.replace(/[<>:"|?*]/g, '_');
}

function str_to_list(text: string): string[] {
  return text.split(/[\r\n]+/).filter(line => line.trim().length > 0);
}

function jm_log(category: string, message: string): void {
  if (JmModuleConfig.FLAG_ENABLE_JM_LOG) {
    console.log(`[${category}] ${message}`);
  }
}

function disable_jm_log(): void {
  (JmModuleConfig as any).FLAG_ENABLE_JM_LOG = false;
}

function traceback_print_exec(): void {
  console.trace();
}

// 缓存装饰器的简单实现
function field_cache(): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cacheKey = Symbol.for(String(propertyKey));

    descriptor.value = function (...args: any[]) {
      if (this[cacheKey] === undefined) {
        this[cacheKey] = originalMethod.apply(this, args);
      }
      return this[cacheKey];
    };

    return descriptor;
  };
}

// CacheRegistry 类实现
class CacheRegistry {
  private static REGISTRY: Record<string | symbol, Record<string | symbol, any>> = {};

  static level_option(option: JmOption, _client: JmcomicClient): Record<string, any> {
    const registry = this.REGISTRY;
    if (!registry[option as any]) {
      registry[option as any] = {};
    }
    return registry[option as any];
  }

  static level_client(_option: JmOption, client: JmcomicClient): Record<string, any> {
    const registry = this.REGISTRY;
    if (!registry[client as any]) {
      registry[client as any] = {};
    }
    return registry[client as any];
  }

  static enable_client_cache_on_condition(
    option: JmOption,
    client: JmcomicClient,
    cache: null | boolean | string | Function
  ): void {
    if (cache === null) {
      return;
    } else if (typeof cache === "boolean") {
      if (cache === false) {
        return;
      } else {
        cache = this.level_option;
      }
    } else if (typeof cache === "string") {
      const func = this[cache as keyof typeof CacheRegistry] as Function;
      ExceptionTool.require_true(func !== undefined, `未实现的cache配置名: ${cache}`);
      cache = func;
    }

    client.set_cache_dict((cache as Function)(option, client));
  }
}

// DirRule 类实现
class DirRule {
  static rule_sample = [
    'Bd_Aid_Pindex',
    'Bd_Aauthor_Atitle_Pindex',
    'Bd_Pindextitle',
    'Bd_Aauthor_Atitle_Pcustomfield',
  ];

  base_dir: string;
  rule_dsl: string;
  solver_list: Array<[string, (detail: JmAlbumDetail | JmPhotoDetail | null) => string, string]>;

  constructor(rule: string, base_dir: string | null = null) {
    this.base_dir = JmcomicText.parse_to_abspath(base_dir || '');
    this.rule_dsl = rule;
    this.solver_list = this.get_role_solver_list(rule, this.base_dir);
  }

  decide_image_save_dir(
    album: JmAlbumDetail,
    photo: JmPhotoDetail
  ): string {
    const path_ls: string[] = [];

    for (const solver of this.solver_list) {
      try {
        const ret = this.apply_rule_solver(album, photo, solver);
        path_ls.push(String(ret));
      } catch (e) {
        jm_log('dir_rule', `路径规则"${solver[2]}"的解析出错: ${e}, album=${album}, photo=${photo}`);
        throw e;
      }
    }

    return fix_filepath(path_ls.join('/'), true);
  }

  decide_album_root_dir(album: JmAlbumDetail): string {
    const path_ls: string[] = [];

    for (const solver of this.solver_list) {
      const [key, _, rule] = solver;

      if (key !== 'Bd' && key !== 'A') {
        continue;
      }

      try {
        const ret = this.apply_rule_solver(album, null, solver);
        path_ls.push(String(ret));
      } catch (e) {
        jm_log('dir_rule', `路径规则"${rule}"的解析出错: ${e}, album=${album}`);
        throw e;
      }
    }

    return fix_filepath(path_ls.join('/'), true);
  }

  get_role_solver_list(
    rule_dsl: string,
    base_dir: string
  ): Array<[string, (detail: JmAlbumDetail | JmPhotoDetail | null) => string, string]> {
    const rule_list = this.split_rule_dsl(rule_dsl);
    const solver_ls: Array<[string, (detail: JmAlbumDetail | JmPhotoDetail | null) => string, string]> = [];

    for (const rule of rule_list) {
      const trimmedRule = rule.trim();
      if (trimmedRule === 'Bd') {
        solver_ls.push(['Bd', (_: any) => base_dir, 'Bd']);
        continue;
      }

      const rule_solver = DirRule.get_rule_solver(trimmedRule);
      if (rule_solver === null) {
        ExceptionTool.raises(`不支持的dsl: "${trimmedRule}" in "${rule_dsl}"`);
      }

      solver_ls.push(rule_solver);
    }

    return solver_ls;
  }

  split_rule_dsl(rule_dsl: string): string[] {
    if (rule_dsl === 'Bd') {
      return [rule_dsl];
    }

    if (rule_dsl.includes('/')) {
      return rule_dsl.split('/');
    }

    if (rule_dsl.includes('_')) {
      return rule_dsl.split('_');
    }

    ExceptionTool.raises(`不支持的rule配置: "${rule_dsl}"`);
  }

  static get_rule_solver(
    rule: string
  ): [string, (detail: JmAlbumDetail | JmPhotoDetail | null) => string, string] | null {
    if (!rule.startsWith('A') && !rule.startsWith('P')) {
      return null;
    }

    const solve_func = (detail: JmAlbumDetail | JmPhotoDetail | null): string => {
      if (!detail) return '';
      return fix_windir_name(String(DetailEntity.get_dirname(detail, rule.substring(1)))).trim();
    };

    return [rule[0], solve_func, rule];
  }

  apply_rule_solver(
    album: JmAlbumDetail | null,
    photo: JmPhotoDetail | null,
    rule_solver: [string, (detail: JmAlbumDetail | JmPhotoDetail | null) => string, string]
  ): string {
    const choose_detail = (key: string): JmAlbumDetail | JmPhotoDetail | null => {
      if (key === 'Bd') return null;
      if (key === 'A') return album;
      if (key === 'P') return photo;
      return null;
    };

    const [key, func, _] = rule_solver;
    const detail = choose_detail(key);
    return func(detail);
  }

  static apply_rule_directly(
    album: JmAlbumDetail,
    photo: JmPhotoDetail,
    rule: string
  ): string {
    const solver = this.get_rule_solver(rule);
    if (!solver) return '';
    return this.apply_rule_solver(album, photo, solver);
  }

  static apply_rule_solver(
    album: JmAlbumDetail | null,
    photo: JmPhotoDetail | null,
    rule_solver: [string, (detail: JmAlbumDetail | JmPhotoDetail | null) => string, string]
  ): string {
    const choose_detail = (key: string): JmAlbumDetail | JmPhotoDetail | null => {
      if (key === 'Bd') return null;
      if (key === 'A') return album;
      if (key === 'P') return photo;
      return null;
    };

    const [key, func, _] = rule_solver;
    const detail = choose_detail(key);
    return func(detail);
  }
}

// JmOption 类实现
class JmOption {
  dir_rule: DirRule;
  client: AdvancedDict;
  download: AdvancedDict;
  plugins: AdvancedDict;
  filepath: string | null;
  need_wait_plugins: any[] = [];
  private _jm_client: JmcomicClient | null = null;

  constructor(
    dir_rule: Record<string, any>,
    download: Record<string, any>,
    client: Record<string, any>,
    plugins: Record<string, any>,
    filepath: string | null = null,
    call_after_init_plugin: boolean = true
  ) {
    this.dir_rule = new DirRule(dir_rule.rule, dir_rule.base_dir);
    this.client = new AdvancedDict(client);
    this.download = new AdvancedDict(download);
    this.plugins = new AdvancedDict(plugins);
    this.filepath = filepath;

    if (call_after_init_plugin) {
      this.call_all_plugin('after_init', true);
    }
  }

  copy_option(): JmOption {
    return new JmOption(
      {
        rule: this.dir_rule.rule_dsl,
        base_dir: this.dir_rule.base_dir,
      },
      this.download.src_dict,
      this.client.src_dict,
      this.plugins.src_dict,
      this.filepath,
      false
    );
  }

  // 决策方法
  decide_image_batch_count(photo: JmPhotoDetail): number {
    return this.download.threading.image;
  }

  decide_photo_batch_count(album: JmAlbumDetail): number {
    return this.download.threading.photo;
  }

  decide_image_filename(image: JmImageDetail): string {
    return image.filename_without_suffix;
  }

  decide_image_suffix(image: JmImageDetail): string {
    if (image.is_gif) {
      return image.img_file_suffix;
    }
    return this.download.image.suffix || image.img_file_suffix;
  }

  decide_image_save_dir(photo: JmPhotoDetail, ensure_exists: boolean = true): string {
    let save_dir = this.dir_rule.decide_image_save_dir(
      photo.from_album,
      photo
    );

    if (ensure_exists) {
      save_dir = JmcomicText.try_mkdir(save_dir);
    }

    return save_dir;
  }

  decide_image_filepath(image: JmImageDetail, consider_custom_suffix: boolean = true): string {
    const save_dir = this.decide_image_save_dir(image.from_photo);
    const suffix = consider_custom_suffix ? this.decide_image_suffix(image) : image.img_file_suffix;
    return path.join(save_dir, fix_windir_name(this.decide_image_filename(image)) + suffix);
  }

  decide_download_cache(image: JmImageDetail): boolean {
    return this.download.cache;
  }

  decide_download_image_decode(image: JmImageDetail): boolean {
    if (image.is_gif) {
      return false;
    }
    return this.download.image.decode;
  }

  // 静态方法
  static default_dict(): Record<string, any> {
    return JmModuleConfig.option_default_dict();
  }

  static default(): JmOption {
    return this.construct({});
  }

  static construct(origdic: Record<string, any>, cover_default: boolean = true): JmOption {
    const dic = cover_default ? this.merge_default_dict(origdic) : origdic;

    // 处理日志设置
    const log = dic.log;
    if (log === false) {
      disable_jm_log();
    }

    // 处理版本
    const version = dic.version;
    if (version !== undefined && parseFloat(version) >= parseFloat(JmModuleConfig.JM_OPTION_VER)) {
      // 跳过兼容性代码
      return new JmOption(
        dic.dir_rule,
        dic.download,
        dic.client,
        dic.plugins,
        dic.filepath
      );
    }

    // 与旧版本兼容
    this.compatible_with_old_versions(dic);

    return new JmOption(
      dic.dir_rule,
      dic.download,
      dic.client,
      dic.plugins,
      dic.filepath
    );
  }

  static compatible_with_old_versions(dic: Record<string, any>): void {
    // 线程配置兼容
    const dt = dic.download.threading;
    if ('batch_count' in dt) {
      const batch_count = dt.batch_count;
      delete dt.batch_count;
      dt.image = batch_count;
    }

    // 插件配置兼容 plugin -> plugins
    if ('plugin' in dic) {
      dic.plugins = dic.plugin;
      delete dic.plugin;
    }
  }

  deconstruct(): Record<string, any> {
    return {
      version: JmModuleConfig.JM_OPTION_VER,
      log: JmModuleConfig.FLAG_ENABLE_JM_LOG,
      dir_rule: {
        rule: this.dir_rule.rule_dsl,
        base_dir: this.dir_rule.base_dir,
      },
      download: this.download.src_dict,
      client: this.client.src_dict,
      plugins: this.plugins.src_dict
    };
  }

  // 文件IO方法
  static from_file(filepath: string): JmOption {
    const [dic, _] = PackerUtil.unpack(filepath);
    dic.filepath = filepath;
    return this.construct(dic);
  }

  to_file(filepath: string | null = null): void {
    if (filepath === null) {
      filepath = this.filepath;
    }

    ExceptionTool.require_true(filepath !== null, "未指定JmOption的保存路径");

    PackerUtil.pack(this.deconstruct(), filepath);
  }

  // 客户端方法
  build_jm_client(kwargs: Record<string, any> = {}): JmcomicClient {
    if (!this._jm_client) {
      this._jm_client = this.new_jm_client(undefined, undefined, undefined, kwargs);
    }
    return this._jm_client;
  }

  new_jm_client(
    domain_list?: string[] | null,
    impl?: string | null,
    cache?: string | null,
    kwargs: Record<string, any> = {}
  ): JmcomicClient {
    // 深拷贝
    const deepCopy = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

    const postman_conf = deepCopy(this.client.postman.src_dict);
    const meta_data = postman_conf.meta_data;
    const retry_times = this.client.retry_times;

    cache = cache !== undefined ? cache : this.client.cache;
    impl = impl || this.client.impl;

    // 处理域名列表
    const decide_domain_list = (): string[] => {
      if (domain_list === undefined || domain_list === null) {
        domain_list = this.client.domain;
      }

      if (typeof domain_list !== 'string' && !Array.isArray(domain_list)) {
        // 是一个对象
        domain_list = domain_list[impl as string] || [];
      }

      if (typeof domain_list === 'string') {
        // 多行文本
        domain_list = str_to_list(domain_list);
      }

      if (domain_list.length === 0) {
        domain_list = this.decide_client_domain(impl as string);
      }

      return domain_list;
    };

    // 合并元数据
    if (Object.keys(kwargs).length !== 0) {
      Object.assign(meta_data, kwargs);
    }

    // 创建postman
    const postman = Postmans.create(postman_conf);

    // 获取客户端类
    const clazz = JmModuleConfig.client_impl_class(impl as string);
    if (clazz === AbstractJmClient || !(clazz.prototype instanceof AbstractJmClient)) {
      throw new Error(`未实现的客户端类型: ${impl}`);
    }

    // 创建客户端
    const client = new clazz(
      postman,
      decide_domain_list(),
      retry_times
    );

    // 启用缓存
    CacheRegistry.enable_client_cache_on_condition(this, client, cache);

    return client;
  }

  update_cookies(cookies: Record<string, any>): void {
    const metadata = this.client.postman.meta_data.src_dict;
    const orig_cookies = metadata.cookies;

    if (orig_cookies === undefined) {
      metadata.cookies = cookies;
    } else {
      Object.assign(orig_cookies, cookies);
      metadata.cookies = orig_cookies;
    }
  }

  decide_client_domain(client_key: string): string[] {
    const is_client_type = (ctype: typeof AbstractJmClient): boolean => {
      return JmOption.client_key_is_given_type(client_key, ctype);
    };

    if (is_client_type(JmApiClient)) {
      // 移动端域名
      return JmModuleConfig.DOMAIN_API_LIST;
    }

    if (is_client_type(JmHtmlClient)) {
      // 网页端域名
      const domain_list = JmModuleConfig.DOMAIN_HTML_LIST;
      if (domain_list) {
        return domain_list;
      }
      return [JmModuleConfig.get_html_domain()];
    }

    throw new Error(`没有配置域名，且是无法识别的client类型: ${client_key}`);
  }

  static client_key_is_given_type(client_key: string, ctype: typeof AbstractJmClient): boolean {
    if (client_key === ctype.client_key) {
      return true;
    }

    const clazz = JmModuleConfig.client_impl_class(client_key);
    if (clazz && clazz.prototype instanceof ctype) {
      return true;
    }

    return false;
  }

  static merge_default_dict(
    user_dict: Record<string, any>,
    default_dict?: Record<string, any>
  ): Record<string, any> {
    if (!default_dict) {
      default_dict = this.default_dict();
    }

    for (const [key, value] of Object.entries(user_dict)) {
      if (typeof value === 'object' && value !== null &&
          typeof default_dict[key] === 'object' && default_dict[key] !== null) {
        default_dict[key] = this.merge_default_dict(value, default_dict[key]);
      } else {
        default_dict[key] = value;
      }
    }

    return default_dict;
  }

  // 下载方法
  download_album(
    album_id: string | number,
    downloader: any = null,
    callback: Function | null = null
  ): void {
    // 从 API 调用下载相册
    console.log(`下载相册 ${album_id}`);
  }

  download_photo(
    photo_id: string | number,
    downloader: any = null,
    callback: Function | null = null
  ): void {
    // 从 API 调用下载照片
    console.log(`下载照片 ${photo_id}`);
  }

  // 插件方法
  call_all_plugin(group: string, safe: boolean = true, extra: Record<string, any> = {}): void {
    const plugin_list = this.plugins.get(group, []);
    if (!plugin_list || plugin_list.length === 0) {
      return;
    }

    // 获取插件注册表
    const plugin_registry = JmModuleConfig.REGISTRY_PLUGIN;

    for (const pinfo of plugin_list) {
      const key = pinfo.plugin;
      const kwargs = pinfo.kwargs || null;
      const pclass = plugin_registry[key];

      ExceptionTool.require_true(pclass !== undefined, `[${group}] 未注册的plugin: ${key}`);

      try {
        this.invoke_plugin(pclass, kwargs, extra, pinfo);
      } catch (e) {
        if (safe) {
          traceback_print_exec();
        } else {
          throw e;
        }
      }
    }
  }

  invoke_plugin(pclass: any, kwargs: Record<string, any> | null, extra: Record<string, any>, pinfo: Record<string, any>): void {
    // 检查插件的参数类型
    kwargs = this.fix_kwargs(kwargs);

    // 合并kwargs和extra
    if (Object.keys(extra).length !== 0) {
      Object.assign(kwargs, extra);
    }

    let plugin = null;

    try {
      // 构建插件对象
      plugin = pclass.build(this);

      // 设置日志开关
      if ('log' in pinfo && pinfo.log !== true) {
        plugin.log_enable = false;
      }

      jm_log('plugin.invoke', `调用插件: [${pclass.plugin_key}]`);

      // 调用插件功能
      plugin.invoke(kwargs);
    } catch (e: any) {
      if (e.name === 'PluginValidationException') {
        this.handle_plugin_valid_exception(e, pinfo, kwargs, plugin, pclass);
      } else if (e.name === 'JmcomicException') {
        this.handle_plugin_jmcomic_exception(e, pinfo, kwargs, plugin, pclass);
      } else {
        this.handle_plugin_unexpected_error(e, pinfo, kwargs, plugin, pclass);
      }
    }
  }

  handle_plugin_valid_exception(e: any, pinfo: Record<string, any>, kwargs: Record<string, any>, plugin: any, pclass: any): void {
    const mode = pinfo.valid || this.plugins.valid;

    if (mode === 'ignore') {
      return;
    }

    if (mode === 'log') {
      jm_log('plugin.validation', `插件 [${e.plugin.plugin_key}] 参数校验异常：${e.msg}`);
      return;
    }

    if (mode === 'raise') {
      throw e;
    }
  }

  handle_plugin_unexpected_error(e: any, pinfo: Record<string, any>, kwargs: Record<string, any>, plugin: any, pclass: any): void {
    const msg = String(e);
    jm_log('plugin.error', `插件 [${pclass.plugin_key}]，运行遇到未捕获异常，异常信息: [${msg}]`);
    throw e;
  }

  handle_plugin_jmcomic_exception(e: any, pinfo: Record<string, any>, kwargs: Record<string, any>, plugin: any, pclass: any): void {
    const msg = String(e);
    jm_log('plugin.exception', `插件 [${pclass.plugin_key}] 调用失败，异常信息: [${msg}]`);
    throw e;
  }

  fix_kwargs(kwargs: Record<string, any> | null): Record<string, any> {
    if (kwargs === null) {
      return {};
    }

    ExceptionTool.require_true(
      typeof kwargs === 'object',
      `插件的kwargs参数必须为dict类型，而不能是类型: ${typeof kwargs}`
    );

    const new_kwargs: Record<string, any> = {};

    for (const [k, v] of Object.entries(kwargs)) {
      let value = v;

      if (typeof v === 'string') {
        value = JmcomicText.parse_dsl_text(v);
      }

      if (typeof k === 'string') {
        new_kwargs[k] = value;
        continue;
      }

      if (typeof k === 'number') {
        const newk = String(k);
        jm_log('plugin.kwargs', `插件参数类型转换: ${k} (${typeof k}) -> ${newk} (${typeof newk})`);
        new_kwargs[newk] = value;
        continue;
      }

      ExceptionTool.raises(
        `插件kwargs参数类型有误，字段: ${k}，预期类型为str，实际类型为${typeof k}`
      );
    }

    return new_kwargs;
  }

  wait_all_plugins_finish(): void {
    for (const plugin of this.need_wait_plugins) {
      plugin.wait_until_finish();
    }
  }
}

export {
  JmOption,
  DirRule,
  CacheRegistry,
  JmAlbumDetail,
  JmPhotoDetail,
  JmImageDetail,
  JmcomicClient,
  JmHtmlClient,
  JmApiClient,
  AbstractJmClient
};
