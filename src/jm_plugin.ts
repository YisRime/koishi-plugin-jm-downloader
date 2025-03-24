/**
 * 该文件存放的是option插件
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { JmOption } from './jm_option';

// 导入需要的模块和类型
import {
  JmAlbumDetail,
  JmPhotoDetail,
  JmImageDetail,
  JmFavoritePage,
  JmModuleConfig,
  JmcomicText,
  JmcomicException,
  ExceptionTool,
  fix_filepath,
  fix_suffix,
  fix_windir_name,
  mkdir_if_not_exists,
  jm_log,
  files_of_dir,
  file_not_exists,
  of_dir_path,
  of_file_name,
  multi_thread_launcher,
  atexit_register,
  str_to_set,
  field_cache,
  get_browser_cookies
} from './common';

class PluginValidationException extends Error {
  plugin: JmOptionPlugin;
  msg: string;

  constructor(plugin: JmOptionPlugin, msg: string) {
    super(msg);
    this.plugin = plugin;
    this.msg = msg;
    Object.setPrototypeOf(this, PluginValidationException.prototype);
  }
}

export class JmOptionPlugin {
  plugin_key: string;
  option: JmOption;
  log_enable: boolean = true;
  delete_original_file: boolean = false;

  constructor(option: JmOption) {
    this.option = option;
  }

  invoke(kwargs: any = {}): void {
    /**
     * 执行插件的功能
     * @param kwargs 给插件的参数
     */
    throw new Error("Method not implemented");
  }

  static build(option: JmOption): JmOptionPlugin {
    /**
     * 创建插件实例
     * @param option JmOption对象
     */
    return new this(option);
  }

  log(msg: string, topic?: string): void {
    if (this.log_enable !== true) {
      return;
    }

    jm_log(
      `plugin.${this.plugin_key}${topic !== undefined ? `.${topic}` : ''}`,
      msg
    );
  }

  require_param(case_condition: any, msg: string): void {
    /**
     * 专门用于校验参数的方法，会抛出特定异常，由option拦截根据策略进行处理
     *
     * @param case_condition 条件
     * @param msg 报错信息
     */
    if (case_condition) {
      return;
    }

    throw new PluginValidationException(this, msg);
  }

  warning_lib_not_install(lib: string): void {
    const msg = `插件\`${this.plugin_key}\`依赖库: ${lib}，请先安装${lib}再使用。` +
                `安装命令: [npm install ${lib}]`;
    console.warn(msg);
  }

  execute_deletion(paths: string[]): void {
    /**
     * 删除文件和文件夹
     * @param paths 路径列表
     */
    if (this.delete_original_file !== true) {
      return;
    }

    for (const p of paths) {
      if (file_not_exists(p)) {
        continue;
      }

      if (fs.statSync(p).isDirectory()) {
        fs.rmdirSync(p, { recursive: true });
      } else {
        fs.unlinkSync(p);
      }
    }
  }

  execute_cmd(cmd: string): number {
    /**
     * 执行shell命令，这里采用简单的实现
     * @param cmd shell命令
     */
    const { execSync } = require('child_process');
    try {
      execSync(cmd);
      return 0;
    } catch (error) {
      return 1;
    }
  }

  execute_multi_line_cmd(cmd: string): void {
    const { execSync } = require('child_process');
    execSync(cmd, { shell: true });
  }

  enter_wait_list(): void {
    this.option.need_wait_plugins.push(this);
  }

  leave_wait_list(): void {
    const index = this.option.need_wait_plugins.indexOf(this);
    if (index !== -1) {
      this.option.need_wait_plugins.splice(index, 1);
    }
  }

  wait_until_finish(): void {
    // 默认实现
  }
}

export class JmLoginPlugin extends JmOptionPlugin {
  /**
   * 功能：登录禁漫，并保存登录后的cookies，让所有client都带上此cookies
   */
  static plugin_key: string = 'login';
  plugin_key: string = 'login';

  invoke({ username, password, impl = null }: {
    username: string,
    password: string,
    impl?: any
  }): void {
    this.require_param(username, '用户名不能为空');
    this.require_param(password, '密码不能为空');

    const client = this.option.build_jm_client(impl);
    client.login(username, password);

    const cookies = client['cookies'];
    this.option.update_cookies(cookies);
    JmModuleConfig.APP_COOKIES = cookies;

    this.log('登录成功');
  }
}

export class UsageLogPlugin extends JmOptionPlugin {
  static plugin_key: string = 'usage_log';
  plugin_key: string = 'usage_log';

  invoke(kwargs: any = {}): void {
    const Thread = require('worker_threads').Worker;
    const t = new Thread(
      this.monitor_resource_usage.toString(),
      {
        eval: true,
        workerData: kwargs
      }
    );

    this.set_thread_as_option_attr(t);
  }

  set_thread_as_option_attr(t: any): void {
    /**
     * 线程留痕
     */
    const name = `thread_${this.plugin_key}`;

    const thread_ls: any[] | undefined = (this.option as any)[name];
    if (thread_ls === undefined) {
      (this.option as any)[name] = [t];
    } else {
      thread_ls.push(t);
    }
  }

  monitor_resource_usage(
    interval: number = 1,
    enable_warning: boolean = true,
    warning_cpu_percent: number = 70,
    warning_mem_percent: number = 70,
    warning_thread_count: number = 100,
  ): void {
    try {
      const psutil = require('psutil');
    } catch (error) {
      this.warning_lib_not_install('psutil');
      return;
    }

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const os = require('os');
    const process = require('process');

    let cpu_percent = null;
    let thread_count = null;
    let mem_usage = null;

    const warning = () => {
      const warning_msg_list: string[] = [];
      if (cpu_percent && cpu_percent >= warning_cpu_percent) {
        warning_msg_list.push(`CPU占用超过警告阈值: ${cpu_percent}% >= ${warning_cpu_percent}%`);
      }

      const mem_percent = os.freemem() / os.totalmem() * 100;
      if (mem_percent >= warning_mem_percent) {
        warning_msg_list.push(`内存占用超过警告阈值: ${mem_percent.toFixed(2)}% >= ${warning_mem_percent}%`);
      }

      if (thread_count && thread_count >= warning_thread_count) {
        warning_msg_list.push(`线程数超过警告阈值: ${thread_count} >= ${warning_thread_count}`);
      }

      if (warning_msg_list.length !== 0) {
        this.log(warning_msg_list.join('\n'), 'warning');
      }
    };

    (async () => {
      while (true) {
        // 获取CPU占用率（0~100）
        cpu_percent = process.cpuUsage().system / 1000;
        // 获取内存占用（MB）
        mem_usage = process.memoryUsage().rss / 1024 / 1024;
        thread_count = os.cpus().length; // 简化实现，实际应当获取应用程序的线程数

        // 打印信息
        const msg = [
          `线程数: ${thread_count}`,
          `CPU占用: ${cpu_percent}%`,
          `内存占用: ${mem_usage.toFixed(2)}MB`,
        ].join(', ');

        this.log(msg, 'log');

        if (enable_warning === true) {
          warning();
        }

        // 等待一段时间
        await sleep(interval * 1000);
      }
    })();
  }
}

export class FindUpdatePlugin extends JmOptionPlugin {
  /**
   * 参考: https://github.com/hect0x7/JMComic-Crawler-Python/issues/95
   */
  static plugin_key: string = 'find_update';
  plugin_key: string = 'find_update';

  invoke(kwargs: any = {}): void {
    this.download_album_with_find_update(kwargs || {});
  }

  download_album_with_find_update(dic: Record<string, number>): void {
    const { download_album } = require('./api');
    const { JmDownloader } = require('./jm_downloader');

    // 带入漫画id, 章节id(第x章)，寻找该漫画下第x章节後的所有章节Id
    const find_update = (album: JmAlbumDetail) => {
      if (!(album.album_id in dic)) {
        return [];
      }

      const photo_ls: JmPhotoDetail[] = [];
      const photo_begin = dic[album.album_id];
      let is_new_photo = false;

      for (const photo of album) {
        if (is_new_photo) {
          photo_ls.push(photo);
          continue;
        }
        if (photo.album_index === photo_begin) {
          is_new_photo = true;
        }
      }

      return photo_ls;
    };

    class FindUpdateDownloader extends JmDownloader {
      do_filter(detail: JmAlbumDetail | JmPhotoDetail) {
        if (detail instanceof JmAlbumDetail) {
          return detail;
        }

        const photo_list = find_update(detail.from_album);
        if (photo_list.some(p => p.id === detail.id)) {
          return detail;
        }

        detail.skip = true;
        return detail;
      }
    }

    // 调用下载api，指定option和downloader
    download_album(
      Object.keys(dic),
      { option: this.option, downloader: FindUpdateDownloader }
    );
  }
}

export class ZipPlugin extends JmOptionPlugin {
  static plugin_key: string = 'zip';
  plugin_key: string = 'zip';
  downloader: any;
  level: string;

  invoke({
    downloader,
    album = null,
    photo = null,
    delete_original_file = false,
    level = 'photo',
    filename_rule = 'Ptitle',
    suffix = 'zip',
    zip_dir = './'
  }: {
    downloader: any,
    album?: JmAlbumDetail | null,
    photo?: JmPhotoDetail | null,
    delete_original_file?: boolean,
    level?: string,
    filename_rule?: string,
    suffix?: string,
    zip_dir?: string
  }): void {
    this.downloader = downloader;
    this.level = level;
    this.delete_original_file = delete_original_file;

    // 确保压缩文件所在文件夹存在
    zip_dir = JmcomicText.parse_to_abspath(zip_dir);
    mkdir_if_not_exists(zip_dir);

    const path_to_delete: string[] = [];
    const photo_dict = this.get_downloaded_photo(downloader, album, photo);

    if (level === 'album') {
      const zip_path = this.get_zip_path(album, null, filename_rule, suffix, zip_dir);
      this.zip_album(album!, photo_dict, zip_path, path_to_delete);
    } else if (level === 'photo') {
      for (const [photo, image_list] of Object.entries(photo_dict)) {
        const photoObj = photo as unknown as JmPhotoDetail;
        const zip_path = this.get_zip_path(null, photoObj, filename_rule, suffix, zip_dir);
        this.zip_photo(photoObj, image_list as any[], zip_path, path_to_delete);
      }
    } else {
      ExceptionTool.raises(`Not Implemented Zip Level: ${level}`);
    }

    this.after_zip(path_to_delete);
  }

  get_downloaded_photo(downloader: any, album: JmAlbumDetail | null, photo: JmPhotoDetail | null): any {
    return (
      album !== null
        ? downloader.download_success_dict[album]
        : downloader.download_success_dict[photo!.from_album]
    );
  }

  zip_photo(photo: JmPhotoDetail, image_list: any[], zip_path: string, path_to_delete: string[]): void {
    /**
     * 压缩photo文件夹
     */
    const photo_dir = image_list.length === 0
      ? this.option.decide_image_save_dir(photo)
      : path.dirname(image_list[0][0]);

    const { backup_dir_to_zip } = require('./common');
    backup_dir_to_zip(photo_dir, zip_path);

    this.log(`压缩章节[${photo.photo_id}]成功 → ${zip_path}`, 'finish');
    path_to_delete.push(this.unified_path(photo_dir));
  }

  unified_path(f: string): string {
    return fix_filepath(f, fs.statSync(f).isDirectory());
  }

  zip_album(album: JmAlbumDetail, photo_dict: any, zip_path: string, path_to_delete: string[]): void {
    /**
     * 压缩album文件夹
     */
    const album_dir = this.option.dir_rule.decide_album_root_dir(album);
    const JSZip = require('jszip');
    const zip = new JSZip();

    for (const photo of Object.keys(photo_dict)) {
      // 定位到章节所在文件夹
      const photo_dir = this.unified_path(this.option.decide_image_save_dir(photo as any));
      // 章节文件夹标记为删除
      path_to_delete.push(photo_dir);

      for (const file of files_of_dir(photo_dir)) {
        const relativePath = path.relative(album_dir, file);
        const buffer = fs.readFileSync(file);
        zip.file(relativePath, buffer);
      }
    }

    zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
      .pipe(fs.createWriteStream(zip_path))
      .on('finish', () => {
        this.log(`压缩本子[${album.album_id}]成功 → ${zip_path}`, 'finish');
      });
  }

  after_zip(path_to_delete: string[]): void {
    // 删除所有原文件
    const dirs = [...path_to_delete].sort().reverse();
    const image_paths = Object.values(this.downloader.download_success_dict)
      .flatMap(photo_dict =>
        Object.values(photo_dict)
          .flatMap(image_list =>
            (image_list as any[]).map(([path, image]: [string, any]) => path)
          )
      );

    this.execute_deletion(image_paths);
    this.execute_deletion(dirs);
  }

  get_zip_path(album: JmAlbumDetail | null, photo: JmPhotoDetail | null, filename_rule: string, suffix: string, zip_dir: string): string {
    /**
     * 计算zip文件的路径
     */
    const filename = this.option.dir_rule.apply_rule_directly(album, photo, filename_rule);
    return path.join(
      zip_dir,
      filename + fix_suffix(suffix),
    );
  }
}

export class ClientProxyPlugin extends JmOptionPlugin {
  static plugin_key: string = 'client_proxy';
  plugin_key: string = 'client_proxy';

  invoke({
    proxy_client_key,
    whitelist = null,
    ...clazz_init_kwargs
  }: {
    proxy_client_key: string,
    whitelist?: string[] | null,
    [key: string]: any
  }): void {
    const whitelist_set = whitelist ? new Set(whitelist) : null;

    const proxy_clazz = JmModuleConfig.client_impl_class(proxy_client_key);
    const new_jm_client = this.option.new_jm_client;

    this.option.new_jm_client = (...args: any[]) => {
      const client = new_jm_client(...args);
      if (whitelist_set !== null && !whitelist_set.has(client.client_key)) {
        return client;
      }

      this.log(`proxy client ${client} with ${proxy_clazz}`);
      return new proxy_clazz(client, clazz_init_kwargs);
    };
  }
}

export class ImageSuffixFilterPlugin extends JmOptionPlugin {
  static plugin_key: string = 'image_suffix_filter';
  plugin_key: string = 'image_suffix_filter';

  invoke({
    allowed_orig_suffix = null,
  }: {
    allowed_orig_suffix?: string[] | null
  }): void {
    if (allowed_orig_suffix === null) {
      return;
    }

    const allowed_suffix_set = new Set(allowed_orig_suffix.map(suffix => fix_suffix(suffix)));

    const option_decide_cache = this.option.decide_download_cache;

    this.option.decide_download_cache = (image: JmImageDetail) => {
      if (!allowed_suffix_set.has(image.img_file_suffix)) {
        return false;
      }

      // let option decide
      return option_decide_cache(image);
    };
  }
}

export class SendQQEmailPlugin extends JmOptionPlugin {
  static plugin_key: string = 'send_qq_email';
  plugin_key: string = 'send_qq_email';

  invoke({
    msg_from,
    msg_to,
    password,
    title,
    content,
    album = null,
    downloader = null,
  }: {
    msg_from: string,
    msg_to: string,
    password: string,
    title: string,
    content: string,
    album?: JmAlbumDetail | null,
    downloader?: any | null,
  }): void {
    this.require_param(msg_from && msg_to && password, '发件人、收件人、授权码都不能为空');

    const { EmailConfig } = require('./common');
    const econfig = new EmailConfig(msg_from, msg_to, password);
    const epostman = econfig.create_email_postman();
    epostman.send(content, title);

    this.log('Email sent successfully');
  }
}

export class LogTopicFilterPlugin extends JmOptionPlugin {
  static plugin_key: string = 'log_topic_filter';
  plugin_key: string = 'log_topic_filter';

  invoke({ whitelist }: { whitelist: string[] | null }): void {
    if (whitelist !== null) {
      const whitelist_set = new Set(whitelist);

      const old_jm_log = JmModuleConfig.EXECUTOR_LOG;

      JmModuleConfig.EXECUTOR_LOG = (topic: string, msg: string) => {
        if (whitelist_set.has(topic)) {
          old_jm_log(topic, msg);
        }
      };
    }
  }
}

export class AutoSetBrowserCookiesPlugin extends JmOptionPlugin {
  static plugin_key: string = 'auto_set_browser_cookies';
  plugin_key: string = 'auto_set_browser_cookies';

  accepted_cookies_keys = str_to_set(`
    yuo1
    remember_id
    remember
  `);

  invoke({
    browser,
    domain,
  }: {
    browser: string,
    domain: string
  }): void {
    /**
     * 坑点预警：由于禁漫需要校验同一设备，使用该插件需要配置自己浏览器的headers，例如
     *
     * ```yml
     * client:
     *   postman:
     *     meta_data:
     *       headers: {
     *        # 浏览器headers
     *       }
     *
     * # 插件配置如下：
     * plugins:
     *   after_init:
     *     - plugin: auto_set_browser_cookies
     *       kwargs:
     *         browser: chrome
     *         domain: 18comic.vip
     * ```
     *
     * @param browser chrome/edge/...
     * @param domain 18comic.vip/...
     * @return cookies
     */
    const get_browser_cookies = require('./common').get_browser_cookies;
    const [cookies, e] = get_browser_cookies(browser, domain, true);

    if (cookies === null) {
      if (e instanceof Error && e.message.includes('Cannot find module')) {
        this.warning_lib_not_install('browser-cookies');
      } else {
        this.log(`获取浏览器cookies失败: ${e}`, 'error');
      }
      return;
    }

    this.option.update_cookies(
      Object.fromEntries(
        Object.entries(cookies).filter(([k]) => this.accepted_cookies_keys.has(k))
      )
    );
    this.log('获取浏览器cookies成功');
  }
}

export class FavoriteFolderExportPlugin extends JmOptionPlugin {
  static plugin_key: string = 'favorite_folder_export';
  plugin_key: string = 'favorite_folder_export';
  save_dir: string;
  zip_enable: boolean;
  zip_filepath: string;
  zip_password: string | null;
  files: string[] = [];
  cl: any;

  invoke({
    save_dir = null,
    zip_enable = false,
    zip_filepath = null,
    zip_password = null,
    delete_original_file = false,
  }: {
    save_dir?: string | null,
    zip_enable?: boolean,
    zip_filepath?: string | null,
    zip_password?: string | null,
    delete_original_file?: boolean,
  }): void {
    this.save_dir = path.resolve(save_dir || path.join(process.cwd(), '/export/'));
    this.zip_enable = zip_enable;
    this.zip_filepath = path.resolve(zip_filepath as string);
    this.zip_password = zip_password;
    this.delete_original_file = delete_original_file;
    this.files = [];

    mkdir_if_not_exists(this.save_dir);
    mkdir_if_not_exists(of_dir_path(this.zip_filepath));

    this.main();
  }

  main(): void {
    const cl = this.option.build_jm_client();
    this.cl = cl;
    const page = cl.favorite_folder();

    // 获取所有的收藏夹
    const folders: Record<string, string> = {};
    for (const [fid, fname] of page.iter_folder_id_name()) {
      folders[fid] = fname;
    }
    // 加上特殊收藏栏【全部】
    folders['0'] = folders['0'] || '全部';

    // 一个收藏夹一个线程，导出收藏夹数据到文件
    multi_thread_launcher(
      Object.entries(folders),
      ([fid, fname]) => this.handle_folder(fid, fname)
    );

    if (!this.zip_enable) {
      return;
    }

    // 压缩导出的文件
    this.require_param(this.zip_filepath, '如果开启zip，请指定zip_filepath参数（压缩文件保存路径）');

    if (this.zip_password === null) {
      this.zip_folder_without_password(this.files, this.zip_filepath);
    } else {
      this.zip_with_password();
    }

    this.execute_deletion(this.files);
  }

  handle_folder(fid: string, fname: string): void {
    this.log(`【收藏夹: ${fname}, fid: ${fid}】开始获取数据`);

    // 获取收藏夹数据
    const page_data = this.fetch_folder_page_data(fid);

    // 序列化到文件
    const filepath = this.save_folder_page_data_to_file(page_data, fid, fname);

    if (filepath === undefined) {
      this.log(`【收藏夹: ${fname}, fid: ${fid}】无内容，跳过保存文件`, 'warning');
      return;
    }

    this.log(`【收藏夹: ${fname}, fid: ${fid}】保存文件成功 → [${filepath}]`);
    this.files.push(filepath);
  }

  fetch_folder_page_data(fid: string): JmFavoritePage[] {
    // 一页一页获取，不使用并行
    return Array.from(this.cl.favorite_folder_gen(fid));
  }

  save_folder_page_data_to_file(page_data: JmFavoritePage[], fid: string, fname: string): string | undefined {
    const filepath = path.resolve(path.join(this.save_dir, fix_windir_name(`【${fid}】${fname}.csv`)));

    const data: [string, string, string][] = [];
    for (const page of page_data) {
      for (const [aid, ainfo] of page.iter_id_title()) {
        data.push([aid, '', ainfo]);
      }
    }

    if (data.length === 0) {
      return undefined;
    }

    fs.writeFileSync(filepath, 'id,author,name\n' +
      data.map(item => item.join(',')).join('\n'),
      { encoding: 'utf-8' }
    );

    return filepath;
  }

  zip_folder_without_password(files: string[], zip_path: string): void {
    /**
     * 压缩文件夹中的文件
     *
     * @param files 要压缩的文件的绝对路径的列表
     * @param zip_path 压缩文件的保存路径
     */
    const JSZip = require('jszip');
    const zip = new JSZip();

    // 获取文件夹中的文件列表并将其添加到 ZIP 文件中
    for (const file of files) {
      const fileContent = fs.readFileSync(file);
      zip.file(path.basename(file), fileContent);
    }

    // 写入zip文件
    zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
      .pipe(fs.createWriteStream(zip_path))
      .on('finish', () => {
        this.log(`成功创建ZIP文件: ${zip_path}`, 'finish');
      });
  }

  zip_with_password(): void {
    // 构造shell命令
    const cmd_list = `
      cd ${this.save_dir}
      7z a "${this.zip_filepath}" "./" -p${this.zip_password} -mhe=on > "../7z_output.txt"
    `;
    this.log(`运行命令: ${cmd_list}`);

    // 执行
    this.execute_multi_line_cmd(cmd_list);
  }
}

export class ConvertJpgToPdfPlugin extends JmOptionPlugin {
  static plugin_key: string = 'j2p';
  plugin_key: string = 'j2p';

  check_image_suffix_is_valid(std_suffix: string): void {
    /**
     * 检查option配置的图片后缀转换，目前限制使用Magick时只能搭配jpg
     * 暂不探究Magick是否支持更多图片格式
     */
    const cur_suffix: string | undefined = this.option.download?.image?.suffix;

    ExceptionTool.requireTrue(
      cur_suffix !== undefined && cur_suffix.endsWith(std_suffix),
      '请把图片的后缀转换配置为jpg，不然无法使用Magick！' +
      `（当前配置是[${cur_suffix}]）\n` +
      `配置模板如下: \n` +
      `\`\`\`\n` +
      `download:\n` +
      `  image:\n` +
      `    suffix: ${std_suffix} # 当前配置是${cur_suffix}\n` +
      `\`\`\``
    );
  }

  invoke({
    photo,
    downloader = null,
    pdf_dir = null,
    filename_rule = 'Pid',
    quality = 100,
    delete_original_file = false,
    override_cmd = null,
    override_jpg = null,
    ...kwargs
  }: {
    photo: JmPhotoDetail,
    downloader?: any,
    pdf_dir?: string | null,
    filename_rule?: string,
    quality?: number,
    delete_original_file?: boolean,
    override_cmd?: string | null,
    override_jpg?: string | null,
    [key: string]: any
  }): void {
    this.delete_original_file = delete_original_file;

    // 检查图片后缀配置
    const suffix = override_jpg || '.jpg';
    this.check_image_suffix_is_valid(suffix);

    // 处理文件夹配置
    const filename = this.option.dir_rule.apply_rule_directly(null, photo, filename_rule);
    const photo_dir = this.option.decide_image_save_dir(photo);

    // 处理生成的pdf文件的路径
    if (pdf_dir === null) {
      pdf_dir = process.cwd();
    } else {
      mkdir_if_not_exists(pdf_dir);
    }

    const pdf_filepath = path.join(pdf_dir, `${filename}.pdf`);

    // 生成命令
    const generateCmd = () => {
      if (override_cmd !== null) {
        return override_cmd
          .replace('{photo_dir}', photo_dir)
          .replace('{pdf_filepath}', pdf_filepath)
          .replace('{quality}', quality.toString());
      }

      return `magick "${photo_dir}/*.jpg" -quality ${quality} "${pdf_filepath}"`;
    };

    const cmd = generateCmd();
    this.log(`Execute Command: [${cmd}]`);
    const code = this.execute_cmd(cmd);

    ExceptionTool.requireTrue(
      code === 0,
      '图片合并为pdf失败！' +
      '请确认你是否安装了magick，安装网站: [https://www.imagemagick.org/]',
    );

    this.log(`Convert Successfully: JM${photo.id} → ${pdf_filepath}`);

    if (downloader !== null) {
      const photo_dict = downloader.download_success_dict.get(photo.from_album);
      if (photo_dict) {
        const image_list = photo_dict.get(photo);
        if (image_list) {
          const paths = image_list.map(([path]: [string, any]) => path);
          this.execute_deletion(paths);
        }
      }
    }
  }
}

export class Img2pdfPlugin extends JmOptionPlugin {
  static plugin_key: string = 'img2pdf';
  plugin_key: string = 'img2pdf';

  invoke({
    photo = null,
    album = null,
    downloader = null,
    pdf_dir = null,
    filename_rule = 'Pid',
    delete_original_file = false,
    ...kwargs
  }: {
    photo?: JmPhotoDetail | null,
    album?: JmAlbumDetail | null,
    downloader?: any,
    pdf_dir?: string | null,
    filename_rule?: string,
    delete_original_file?: boolean,
    [key: string]: any
  }): void {
    if (photo === null && album === null) {
      this.log('请指定photo或album参数', 'error');
      return;
    }

    try {
      require('img2pdf');
    } catch (error) {
      this.warning_lib_not_install('img2pdf');
      return;
    }

    this.delete_original_file = delete_original_file;

    // 处理生成的pdf文件的路径
    pdf_dir = this.ensure_make_pdf_dir(pdf_dir);

    // 处理pdf文件名
    const filename = this.option.dir_rule.apply_rule_directly(album, photo, filename_rule);

    // pdf路径
    const pdf_filepath = path.join(pdf_dir, `${filename}.pdf`);

    // 调用 img2pdf 把 photo_dir 下的所有图片转为pdf
    const [img_path_ls, img_dir_ls] = this.write_img_2_pdf(pdf_filepath, album, photo);
    this.log(`Convert Successfully: JM${album || photo} → ${pdf_filepath}`);

    // 执行删除
    const paths_to_delete = [...img_path_ls, ...img_dir_ls];
    this.execute_deletion(paths_to_delete);
  }

  write_img_2_pdf(pdf_filepath: string, album: JmAlbumDetail | null, photo: JmPhotoDetail | null): [string[], string[]] {
    const img2pdf = require('img2pdf');

    let img_dir_ls: string[];
    if (album === null) {
      img_dir_ls = [this.option.decide_image_save_dir(photo!)];
    } else {
      img_dir_ls = Array.from(album).map(photo => this.option.decide_image_save_dir(photo));
    }

    let img_path_ls: string[] = [];

    for (const img_dir of img_dir_ls) {
      const files = files_of_dir(img_dir).filter(f =>
        f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg'));
      img_path_ls = [...img_path_ls, ...files];
    }

    fs.writeFileSync(pdf_filepath, img2pdf.convert(img_path_ls));

    return [img_path_ls, img_dir_ls];
  }

  ensure_make_pdf_dir(pdf_dir: string | null): string {
    pdf_dir = pdf_dir || process.cwd();
    pdf_dir = fix_filepath(pdf_dir, true);
    mkdir_if_not_exists(pdf_dir);
    return pdf_dir;
  }
}

export class LongImgPlugin extends JmOptionPlugin {
  static plugin_key: string = 'long_img';
  plugin_key: string = 'long_img';

  invoke({
    photo = null,
    album = null,
    downloader = null,
    img_dir = null,
    filename_rule = 'Pid',
    delete_original_file = false,
    ...kwargs
  }: {
    photo?: JmPhotoDetail | null,
    album?: JmAlbumDetail | null,
    downloader?: any,
    img_dir?: string | null,
    filename_rule?: string,
    delete_original_file?: boolean,
    [key: string]: any
  }): void {
    if (photo === null && album === null) {
      this.log('请指定photo或album参数', 'error');
      return;
    }

    try {
      require('jimp');
    } catch (error) {
      this.warning_lib_not_install('jimp');
      return;
    }

    this.delete_original_file = delete_original_file;

    // 处理文件夹配置
    img_dir = this.get_img_dir(img_dir);

    // 处理生成的长图文件的路径
    const filename = this.option.dir_rule.apply_rule_directly(album, photo, filename_rule);

    // 长图路径
    const long_img_path = path.join(img_dir, `${filename}.png`);

    // 调用 jimp 把 photo_dir 下的所有图片合并为长图
    const img_path_ls = this.write_img_2_long_img(long_img_path, album, photo);
    this.log(`Convert Successfully: JM${album || photo} → ${long_img_path}`);

    // 执行删除
    this.execute_deletion(img_path_ls);
  }

  async write_img_2_long_img(long_img_path: string, album: JmAlbumDetail | null, photo: JmPhotoDetail | null): Promise<string[]> {
    const Jimp = require('jimp');

    let img_dir_items: string[];
    if (album === null) {
      img_dir_items = [this.option.decide_image_save_dir(photo!)];
    } else {
      img_dir_items = Array.from(album).map(photo => this.option.decide_image_save_dir(photo));
    }

    let img_paths: string[] = [];
    for (const dir of img_dir_items) {
      const files = files_of_dir(dir).filter(f =>
        f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg'));
      img_paths = [...img_paths, ...files];
    }

    const images = await Promise.all(img_paths.map(async (path) => {
      try {
        return await Jimp.read(path);
      } catch (err) {
        console.error(`读取图片失败: ${path}`, err);
        return null;
      }
    }));

    const validImages = images.filter(img => img !== null);
    const min_img_width = Math.min(...validImages.map(img => img.bitmap.width));

    let total_height = 0;
    for (let i = 0; i < validImages.length; i++) {
      total_height += validImages[i].bitmap.height;
    }

    const long_img = new Jimp(min_img_width, total_height);

    let y_offset = 0;
    for (const img of validImages) {
      long_img.composite(img, 0, y_offset);
      y_offset += img.bitmap.height;
    }

    await long_img.writeAsync(long_img_path);

    return img_paths;
  }

  get_img_dir(img_dir: string | null): string {
    img_dir = fix_filepath(img_dir || process.cwd());
    mkdir_if_not_exists(img_dir);
    return img_dir;
  }
}

export class JmServerPlugin extends JmOptionPlugin {
  static plugin_key: string = 'jm_server';
  plugin_key: string = 'jm_server';
  static single_instance: JmServerPlugin;

  static default_run_kwargs = {
    host: '0.0.0.0',
    port: 80,
    debug: false,
  };

  static single_instance_lock = new (require('mutex'))();
  run_server_lock: any;
  running: boolean = false;
  server_thread: any = null;

  constructor(option: JmOption) {
    super(option);
    this.run_server_lock = new (require('mutex'))();
  }

  invoke({
    password = '',
    base_dir = null,
    album = null,
    photo = null,
    downloader = null,
    run = null,
    ...kwargs
  }: {
    password?: string,
    base_dir?: string | null,
    album?: JmAlbumDetail | null,
    photo?: JmPhotoDetail | null,
    downloader?: any,
    run?: Record<string, any> | null,
    [key: string]: any
  }): void {
    /**
     * @param password 密码
     * @param base_dir 初始访问服务器的根路径
     * @param album 为了支持 after_album 这种调用时机
     * @param photo 为了支持 after_album 这种调用时机
     * @param downloader 为了支持 after_album 这种调用时机
     * @param run 用于启动服务器: app.run(**run_kwargs)
     * @param kwargs 用于JmServer构造函数: JmServer(base_dir, password, **kwargs)
     */

    if (base_dir === null) {
      base_dir = album
        ? this.option.dir_rule.decide_album_root_dir(album)
        : process.cwd();
    }

    if (run === null) {
      run = JmServerPlugin.default_run_kwargs;
    } else if (run.debug && require('thread-id') !== require('worker_threads').threadId) {
      this.warning_wrong_usage_of_debug();
      return;
    }

    if (this.running === true) {
      return;
    }

    this.run_server_lock.lock(() => {
      this.running = true;

      const { JmServer } = require('./jm_server');
      const app = new JmServer(
        base_dir,
        password,
        Object.assign({}, kwargs)
      );

      if (run) {
        this.server_thread = require('thread-id');
        this.enter_wait_list();

        app.listen(run.port, run.host, () => {
          this.log(`服务器启动成功，访问：http://${run.host}:${run.port}`, 'start');
        });
      }
    });
  }

  warning_wrong_usage_of_debug(): void {
    this.log('注意！当配置debug=True时，请确保当前插件是在主线程中被调用。\n' +
             '因为如果本插件配置在 [after_album/after_photo] 这种时机调用，\n' +
             '会使得express框架不在主线程debug运行，\n' +
             '导致报错。\n' +
             '【基于上述原因，当前线程非主线程，不启动服务器】',
             'warning'
            );
  }

  wait_server_stop(proactive = false): void {
    const st = this.server_thread;
    if (
      st === null ||
      st === require('thread-id') ||
      !st
    ) {
      return;
    }

    const msg = proactive
      ? `[${this.plugin_key}]的服务器线程仍运行中，可按下ctrl+c结束程序`
      : `主线程执行完毕，但插件[${this.plugin_key}]的服务器线程仍运行中，可按下ctrl+c结束程序`;

    this.log(msg, 'wait');

    const wait = () => {
      setTimeout(() => {
        if (this.running) {
          wait();
        } else {
          this.leave_wait_list();
        }
      }, 1000);
    };

    wait();
  }

  wait_until_finish(): void {
    this.wait_server_stop(true);
  }

  static build(option: JmOption): JmOptionPlugin {
    /**
     * 单例模式
     */
    let instance = JmServerPlugin.single_instance;
    if (instance !== undefined) {
      return instance;
    }

    JmServerPlugin.single_instance_lock.lock(() => {
      if (JmServerPlugin.single_instance === undefined) {
        JmServerPlugin.single_instance = new JmServerPlugin(option);
      }
    });

    return JmServerPlugin.single_instance;
  }
}

export class SubscribeAlbumUpdatePlugin extends JmOptionPlugin {
  static plugin_key: string = 'subscribe_album_update';
  plugin_key: string = 'subscribe_album_update';

  invoke({
    album_photo_dict = null,
    email_notify = null,
    download_if_has_update = true,
    auto_update_after_download = true,
  }: {
    album_photo_dict?: Record<string, string> | null,
    email_notify?: any,
    download_if_has_update?: boolean,
    auto_update_after_download?: boolean,
  }): void {
    if (album_photo_dict === null) {
      this.log('请指定 album_photo_dict 参数，格式: {album_id: photo_id, ...}', 'error');
      return;
    }

    const album_photo_dict_copy = {...album_photo_dict};
    for (const [album_id, photo_id] of Object.entries(album_photo_dict_copy)) {
      const [has_update, photo_new_list] = this.check_photo_update(album_id, photo_id);

      if (has_update) {
        this.log(`本子 [${album_id}] 有更新: ${photo_new_list.join(', ')}`, 'update');

        // 发送邮件通知
        if (email_notify) {
          this.send_email_notify(email_notify, album_id, photo_id, photo_new_list);
        }

        // 下载更新
        if (download_if_has_update) {
          this.download_update(album_id, photo_new_list);

          // 更新记录
          if (auto_update_after_download) {
            album_photo_dict[album_id] = photo_new_list[photo_new_list.length - 1];
          }
        }
      } else {
        this.log(`本子 [${album_id}] 无更新`, 'check');
      }
    }
  }

  check_photo_update(album_id: string, photo_id: string): [boolean, string[]] {
    const client = this.option.new_jm_client();
    const album = client.get_album_detail(album_id);

    const photo_new_list: string[] = [];
    let is_new_photo = false;
    const sentinel = parseInt(photo_id);

    for (const photo of album) {
      if (is_new_photo) {
        photo_new_list.push(photo.id);
        continue;
      }

      if (photo.album_index === sentinel) {
        is_new_photo = true;
      }
    }

    return [photo_new_list.length !== 0, photo_new_list];
  }

  send_email_notify(email_notify: any, album_id: string, photo_id: string, photo_new_list: string[]): void {
    // 简化实现，实际应使用SendQQEmailPlugin
    this.log(`发送邮件通知: 本子 [${album_id}] 有更新: ${photo_new_list.join(', ')}`, 'email');
  }

  download_update(album_id: string, photo_list: string[]): void {
    const { download_photo } = require('./api');
    download_photo(photo_list, this.option);
  }
}

export class SkipPhotoWithFewImagesPlugin extends JmOptionPlugin {
  static plugin_key: string = 'skip_photo_with_few_images';
  plugin_key: string = 'skip_photo_with_few_images';

  invoke({
    at_least_image_count,
    photo = null,
    image = null,
    album = null,
    ...kwargs
  }: {
    at_least_image_count: number,
    photo?: JmPhotoDetail | null,
    image?: JmImageDetail | null,
    album?: JmAlbumDetail | null,
    [key: string]: any
  }): void {
    this.try_mark_photo_skip_and_log(photo, at_least_image_count);
    if (image !== null) {
      this.try_mark_photo_skip_and_log(image.from_photo, at_least_image_count);
    }
  }

  try_mark_photo_skip_and_log(photo: JmPhotoDetail | null, at_least_image_count: number): void {
    if (photo === null) {
      return;
    }

    if (photo.length >= at_least_image_count) {
      return;
    }

    this.log(`跳过下载章节: ${photo.id} (${photo.album_id}[${photo.index}/${photo.from_album.length}])，` +
             `因为其图片数: ${photo.length} < ${at_least_image_count} (at_least_image_count)`);
    photo.skip = true;
  }

  @field_cache()  // 单例
  static build(option: JmOption): JmOptionPlugin {
    return new SkipPhotoWithFewImagesPlugin(option);
  }
}

export class DeleteDuplicatedFilesPlugin extends JmOptionPlugin {
  /**
   * https://github.com/hect0x7/JMComic-Crawler-Python/issues/244
   */
  static plugin_key: string = 'delete_duplicated_files';
  plugin_key: string = 'delete_duplicated_files';

  static calculate_md5(file_path: string): string {
    const crypto = require('crypto');

    /**计算文件的MD5哈希值*/
    const hash = crypto.createHash('md5');
    const fileData = fs.readFileSync(file_path);
    hash.update(fileData);
    return hash.digest('hex');
  }

  static find_duplicate_files(root_folder: string): Record<string, string[]> {
    /**递归读取文件夹下所有文件并计算MD5出现次数*/
    const md5_dict: Record<string, string[]> = {};

    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          walk(filePath);
        } else {
          const md5 = DeleteDuplicatedFilesPlugin.calculate_md5(filePath);
          if (!md5_dict[md5]) {
            md5_dict[md5] = [];
          }
          md5_dict[md5].push(filePath);
        }
      }
    };

    walk(root_folder);
    return md5_dict;
  }

  invoke({
    limit,
    album = null,
    downloader = null,
    delete_original_file = true,
    ...kwargs
  }: {
    limit: number,
    album?: JmAlbumDetail | null,
    downloader?: any,
    delete_original_file?: boolean,
    [key: string]: any
  }): void {
    if (album === null) {
      this.log('请指定album参数', 'error');
      return;
    }

    this.delete_original_file = delete_original_file;
    // 获取到下载本子所在根目录
    const root_folder = this.option.dir_rule.decide_album_root_dir(album);
    this.find_duplicated_files_and_delete(limit, root_folder, album);
  }

  find_duplicated_files_and_delete(limit: number, root_folder: string, album: JmAlbumDetail | null = null): void {
    const md5_dict = DeleteDuplicatedFilesPlugin.find_duplicate_files(root_folder);
    // 打印MD5出现次数大于等于limit的文件
    for (const [md5, paths] of Object.entries(md5_dict)) {
      if (paths.length >= limit) {
        this.log(`发现重复文件，MD5: ${md5}，共${paths.length}个`);
        // 保留第一个文件，删除其他文件
        const keepFile = paths[0];
        const deleteFiles = paths.slice(1);

        this.log(`保留文件: ${keepFile}`);
        for (const filePath of deleteFiles) {
          this.log(`删除重复文件: ${filePath}`);
        }

        this.execute_deletion(deleteFiles);
      }
    }
  }
}

export class ReplacePathStringPlugin extends JmOptionPlugin {
  static plugin_key: string = 'replace_path_string';
  plugin_key: string = 'replace_path_string';

  invoke({
    replace,
  }: {
    replace: Record<string, string>,
  }): void {
    if (!replace) {
      this.log('请指定replace参数，格式: {原字符串: 替换后的字符串, ...}', 'error');
      return;
    }

    const old_decide_dir = this.option.decide_image_save_dir;

    this.option.decide_image_save_dir = (photo: JmPhotoDetail, ensure_exists: boolean = true): string => {
      let dir = old_decide_dir.call(this.option, photo, false);

      for (const [oldStr, newStr] of Object.entries(replace)) {
        dir = dir.replace(oldStr, newStr);
      }

      if (ensure_exists) {
        mkdir_if_not_exists(dir);
      }

      return dir;
    };
  }
}
