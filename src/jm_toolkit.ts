import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { Sharp } from 'sharp';

// 定义一些接口和类型
interface JmPhotoDetail {
  photo_id: string;
  scramble_id: string;
  name: string;
  data_original_domain: string;
  data_original_0: string;
  tags: string;
  series_id: string;
  sort: string;
  page_arr: string[];
}

interface JmAlbumDetail {
  album_id: string;
  scramble_id: string;
  name: string;
  episode_list: [string, string, string, string][];
  page_count: string;
  pub_date: string;
  update_date: string;
  works: string[];
  actors: string[];
  tags: string[];
  authors: string[];
  likes: string;
  views: string;
  comment_count: string;
}

interface JmSearchPage {
  content: [string, any][];
  total: number;
}

interface JmFavoritePage {
  content: [string, any][];
  folder_list: any[];
  total: number;
}

interface JmImageDetail {
  scramble_id: string;
  aid: string;
  img_file_name: string;
}

class AdvancedDict {
  private srcDict: Record<string, any>;

  constructor(obj: Record<string, any>) {
    this.srcDict = obj;
  }

  get(key: string, defaultValue?: any): any {
    return key in this.srcDict ? this.srcDict[key] : defaultValue;
  }

  get src_dict(): Record<string, any> {
    return this.srcDict;
  }
}

// 配置和常量
class JmModuleConfig {
  static readonly PROT = 'https://';
  static readonly DOMAIN_IMAGE_LIST = ['cdn-msp.jmcomic1.mobi', 'msp.jmcomic.me'];
  static readonly VAR_FILE_NAME_LENGTH_LIMIT = 200;

  static photo_class(): any {
    return JmPhotoDetail;
  }

  static album_class(): any {
    return JmAlbumDetail;
  }
}

class JmMagicConstants {
  static readonly SCRAMBLE_268850 = 268850;
  static readonly SCRAMBLE_421926 = 421926;
  static readonly APP_VERSION = "1.6.3";
  static readonly APP_TOKEN_SECRET = "18comicAPP";
  static readonly APP_DATA_SECRET = "18comicAPPContent";
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

  static raises_regex(message: string, options: { html?: string, pattern?: RegExp } = {}): never {
    throw new Error(message);
  }
}

// 辅助函数
function mkdir_if_not_exists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function of_file_name(filePath: string, trimSuffix = false): string {
  const basename = path.basename(filePath);
  return trimSuffix ? basename.substring(0, basename.lastIndexOf('.')) : basename;
}

function of_file_suffix(filePath: string): string {
  const ext = path.extname(filePath);
  return ext || '';
}

function change_file_name(filePath: string, newName: string): string {
  return path.join(path.dirname(filePath), newName);
}

class JmcomicText {
  static pattern_jm_domain = /https?:\/\/([\w.-]+)/;
  static pattern_jm_pa_id = [
    [/(?:photos?|albums?)\/(\d+)/, 1],
    [/id=(\d+)/, 1],
  ];
  static pattern_html_jm_pub_domain = /[\w-]+\.\w+\/?\w+/g;

  static pattern_html_photo_photo_id = /<meta property="og:url" content=".*?\/photo\/(\d+)\/?.+?">/;
  static pattern_html_photo_scramble_id = /var scramble_id = (\d+);/;
  static pattern_html_photo_name = /<title>([\s\S]*?)\|.*<\/title>/;
  static pattern_html_photo_data_original_domain = /src="https:\/\/(.*?)\/media\/albums\/blank/;
  static pattern_html_photo_data_original_0 = /data-original="(.*?)"[^>]*?id="album_photo[^>]*?data-page="0"/;
  static pattern_html_photo_tags = /<meta name="keywords"[\s\S]*?content="(.*?)"/;
  static pattern_html_photo_series_id = /var series_id = (\d+);/;
  static pattern_html_photo_sort = /var sort = (\d+);/;
  static pattern_html_photo_page_arr = /var page_arr = (.*?);/;

  static pattern_html_album_album_id = /<span class="number">.*?：JM(\d+)<\/span>/;
  static pattern_html_album_scramble_id = /var scramble_id = (\d+);/;
  static pattern_html_album_name = /<h1 class="book-name" id="book-name">([\s\S]*?)<\/h1>/;
  static pattern_html_album_episode_list = /data-album="(\d+)"[^>]*>\s*?<li.*?>\s*?第(\d+)話([\s\S]*?)<[\s\S]*?>(\d+-\d+-\d+).*?/g;
  static pattern_html_album_page_count = /<span class="pagecount">.*?:(\d+)<\/span>/;
  static pattern_html_album_pub_date = />上架日期 : (.*?)<\/span>/;
  static pattern_html_album_update_date = />更新日期 : (.*?)<\/span>/;
  static pattern_html_tag_a = /<a[^>]*?>\s*(\S*)\s*<\/a>/g;

  static pattern_html_album_works = [
    /<span itemprop="author" data-type="works">([\s\S]*?)<\/span>/,
    /<a[^>]*?>\s*(\S*)\s*<\/a>/g,
  ];

  static pattern_html_album_actors = [
    /<span itemprop="author" data-type="actor">([\s\S]*?)<\/span>/,
    /<a[^>]*?>\s*(\S*)\s*<\/a>/g,
  ];

  static pattern_html_album_tags = [
    /<span itemprop="genre" data-type="tags">([\s\S]*?)<\/span>/,
    /<a[^>]*?>\s*(\S*)\s*<\/a>/g,
  ];

  static pattern_html_album_authors = [
    /作者： *<span itemprop="author" data-type="author">([\s\S]*?)<\/span>/,
    /<a[^>]*?>\s*(\S*)\s*<\/a>/g,
  ];

  static pattern_html_album_likes = /<span id="albim_likes_\d+">(.*?)<\/span>/;
  static pattern_html_album_views = /<span>(.*?)<\/span>\n *<span>(次觀看|观看次数|次观看次数)<\/span>/;
  static pattern_html_album_comment_count = [/<div class="badge"[^>]*?id="total_video_comments">(\d+)<\/div>/, 0];

  static pattern_ajax_favorite_msg = /<\/button>(.*?)<\/div>/;

  static parse_to_jm_domain(text: string): string {
    if (text.startsWith(JmModuleConfig.PROT)) {
      const match = this.pattern_jm_domain.exec(text);
      return match ? match[1] : text;
    }
    return text;
  }

  static parse_to_jm_id(text: string | number): string {
    if (typeof text === 'number') {
      return text.toString();
    }

    ExceptionTool.require_true(typeof text === 'string', `无法解析jm车号, 参数类型为: ${typeof text}`);

    if (/^\d+$/.test(text)) {
      return text;
    }

    ExceptionTool.require_true(text.length >= 2, `无法解析jm车号, 文本太短: ${text}`);

    const c0 = text[0];
    const c1 = text[1];
    if ((c0 === 'J' || c0 === 'j') && (c1 === 'M' || c1 === 'm')) {
      return text.substring(2);
    } else {
      for (const [pattern, index] of this.pattern_jm_pa_id) {
        const match = pattern.exec(text);
        if (match !== null) {
          return match[index];
        }
      }

      ExceptionTool.raises(`无法解析jm车号, 文本为: ${text}`);
    }
  }

  static analyse_jm_pub_html(html: string, domainKeyword = ['jm', 'comic']): string[] {
    const domains = [...html.matchAll(this.pattern_html_jm_pub_domain)]
      .map(match => match[0])
      .filter(domain => domainKeyword.some(kw => domain.includes(kw)));

    return domains;
  }

  static analyse_jm_photo_html(html: string): JmPhotoDetail {
    return this.reflect_new_instance(
      html,
      "pattern_html_photo_",
      JmModuleConfig.photo_class()
    );
  }

  static analyse_jm_album_html(html: string): JmAlbumDetail {
    return this.reflect_new_instance(
      html,
      "pattern_html_album_",
      JmModuleConfig.album_class()
    );
  }

  static reflect_new_instance(html: string, clsFieldPrefix: string, clazz: any): any {
    const matchField = (fieldName: string, pattern: RegExp | RegExp[], text: string): any => {
      if (Array.isArray(pattern)) {
        const lastPattern = pattern[pattern.length - 1];
        let matchText = text;

        for (let i = 0; i < pattern.length - 1; i++) {
          const match = pattern[i].exec(matchText);
          if (match === null) {
            return null;
          }
          matchText = match[0];
        }

        if (fieldName.endsWith("_list")) {
          return [...matchText.matchAll(lastPattern)].map(m => m[1]);
        } else {
          const match = lastPattern.exec(matchText);
          return match ? match[1] : null;
        }
      }

      if (fieldName.endsWith("_list")) {
        return [...text.matchAll(pattern)].map(m => m[1]);
      } else {
        const match = pattern.exec(text);
        return match ? match[1] : null;
      }
    };

    const fieldDict: Record<string, any> = {};

    for (const key of Object.keys(this)) {
      if (!key.startsWith(clsFieldPrefix)) {
        continue;
      }

      let pattern = (this as any)[key];
      let defaultValue = null;

      if (Array.isArray(pattern) && typeof pattern[1] === 'number') {
        [pattern, defaultValue] = pattern;
      }

      const fieldName = key.substring(key.indexOf(clsFieldPrefix) + clsFieldPrefix.length);
      const fieldValue = matchField(fieldName, pattern, html);

      if (fieldValue === null) {
        if (defaultValue === null) {
          ExceptionTool.raises_regex(
            `文本没有匹配上字段：字段名为'${fieldName}'，pattern: [${pattern}]` +
            (html.length < 200 ? `\n响应文本=[${html}]` :
              `响应文本过长(len=${html.length})，不打印`),
            { html, pattern }
          );
        } else {
          fieldDict[fieldName] = defaultValue;
        }
      } else {
        fieldDict[fieldName] = fieldValue;
      }
    }

    return new clazz(fieldDict);
  }

  static format_url(path: string, domain: string): string {
    ExceptionTool.require_true(typeof domain === 'string' && domain.length !== 0, '域名为空');

    if (domain.startsWith(JmModuleConfig.PROT)) {
      return `${domain}${path}`;
    }

    return `${JmModuleConfig.PROT}${domain}${path}`;
  }

  static format_album_url(aid: string, domain = '18comic.vip'): string {
    return this.format_url(`/album/${aid}/`, domain);
  }

  static class DSLReplacer {
    private dslDict: Map<RegExp, (match: RegExpExecArray) => string> = new Map();

    parse_dsl_text(text: string): string {
      let result = text;
      this.dslDict.forEach((replacer, pattern) => {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(result)) !== null) {
          result = result.substring(0, match.index) +
                  replacer(match) +
                  result.substring(match.index + match[0].length);
          pattern.lastIndex = 0; // Reset to prevent infinite loops
        }
      });
      return result;
    }

    add_dsl_and_replacer(dsl: string, replacer: (match: RegExpExecArray) => string): void {
      const pattern = new RegExp(dsl, 'g');
      this.dslDict.set(pattern, replacer);
    }
  }

  static match_os_env(match: RegExpExecArray): string {
    const name = match[1];
    const value = process.env[name];
    ExceptionTool.require_true(value !== undefined, `未配置环境变量: ${name}`);
    return value;
  }

  static dsl_replacer = new this.DSLReplacer();

  static parse_to_abspath(dslText: string): string {
    return path.resolve(this.parse_dsl_text(dslText));
  }

  static parse_dsl_text(dslText: string): string {
    return this.dsl_replacer.parse_dsl_text(dslText);
  }

  static bracket_map: Record<string, string> = {
    '(': ')',
    '[': ']',
    '【': '】',
    '（': '）',
  };

  static parse_orig_album_name(name: string, defaultValue: string | null = null): string {
    const wordList = this.tokenize(name);

    for (const word of wordList) {
      if (!(word[0] in this.bracket_map)) {
        return word;
      }
    }

    return defaultValue || name;
  }

  static tokenize(title: string): string[] {
    title = title.trim();
    const ret: string[] = [];
    const bracketMap = this.bracket_map;

    const charList: string[] = [];
    let i = 0;
    const length = title.length;

    const add = (w?: string) => {
      if (w === undefined) {
        w = charList.join('').trim();
      }

      if (w === '') {
        return;
      }

      ret.push(w);
      charList.length = 0;
    };

    const findRightPair = (leftPair: string, startIdx: number): number => {
      const stack = [leftPair];
      let j = startIdx + 1;

      while (j < length && stack.length !== 0) {
        const c = title[j];
        if (c in bracketMap) {
          stack.push(c);
        } else if (c === bracketMap[stack[stack.length - 1]]) {
          stack.pop();
        }

        j++;
      }

      return stack.length === 0 ? j : -1;
    };

    while (i < length) {
      const c = title[i];

      if (c in bracketMap) {
        add();

        const j = findRightPair(c, i);
        if (j === -1) {
          charList.push(c);
          i++;
          continue;
        }

        add(title.substring(i, j));
        i = j;
      } else {
        charList.push(c);
        i++;
      }
    }

    add();
    return ret;
  }

  static to_zh_cn(s: string): string {
    // 在TypeScript中没有直接等价的zhconv库，这里简化处理
    // 实际使用时可能需要引入转换简繁体的库
    return s;
  }

  static try_mkdir(saveDir: string): string {
    try {
      mkdir_if_not_exists(saveDir);
    } catch (e: any) {
      if (e.code === 'ENAMETOOLONG') {
        // 目录名过长
        const limit = JmModuleConfig.VAR_FILE_NAME_LENGTH_LIMIT;
        console.error(`目录名过长，无法创建目录，强制缩短到${limit}个字符并重试`);
        saveDir = saveDir.substring(0, limit);
        return this.try_mkdir(saveDir);
      }
      throw e;
    }
    return saveDir;
  }
}

// 支持dsl: #{???} -> process.env.???
JmcomicText.dsl_replacer.add_dsl_and_replacer('\\$\\{(.*?)\\}', JmcomicText.match_os_env);

class PatternTool {
  static match_or_default(html: string, pattern: RegExp, defaultValue: any): string {
    const match = pattern.exec(html);
    return match === null ? defaultValue : match[1];
  }

  static require_match(html: string, pattern: RegExp, msg: string, rindex = 1): string | RegExpExecArray {
    const match = pattern.exec(html);
    if (match !== null) {
      return rindex !== null ? match[rindex] : match;
    }

    ExceptionTool.raises_regex(
      msg,
      { html, pattern }
    );
  }

  static require_not_match(html: string, pattern: RegExp, msgFunc: (match: RegExpExecArray) => string): void {
    const match = pattern.exec(html);
    if (match === null) {
      return;
    }

    ExceptionTool.raises_regex(
      msgFunc(match),
      { html, pattern }
    );
  }
}

class JmPageTool {
  // 用来缩减html的长度
  static pattern_html_search_shorten_for = /<div class="well well-sm">([\s\S]*)<div class="row">/;

  // 用来提取搜索页面的album的信息
  static pattern_html_search_album_info_list = /<a href="\/album\/(\d+)\/[\s\S]*?title="(.*?)"([\s\S]*?)<div class="title-truncate tags .*>([\s\S]*?)<\/div>/g;

  // 用来提取分类页面的album的信息
  static pattern_html_category_album_info_list = /<a href="\/album\/(\d+)\/[^>]*>[^>]*?title="(.*?)"[^>]*>[ \n]*<\/a>[ \n]*<div class="label-loveicon">([\s\S]*?)<div class="clearfix">/g;

  // 用来查找tag列表
  static pattern_html_search_tags = /<a[^>]*?>(.*?)<\/a>/g;

  // 查找错误，例如 [错误，關鍵字過短，請至少輸入兩個字以上。]
  static pattern_html_search_error = /<fieldset>\n<legend>(.*?)<\/legend>\n<div class=.*?>\n(.*?)\n<\/div>\n<\/fieldset>/;

  static pattern_html_search_total = [/class="text-white">(\d+)<\/span> A漫./, 0];

  // 收藏页面的本子结果
  static pattern_html_favorite_content = /<div id="favorites_album_[^>]*?>[\s\S]*?<a href="\/album\/(\d+)\/[^"]*">[\s\S]*?<div class="video-title title-truncate">([^<]*?)<\/div>/g;

  // 收藏夹的收藏总数
  static pattern_html_favorite_total = / : (\d+)[^/]*\/\D*(\d+)/;

  // 所有的收藏夹
  static pattern_html_favorite_folder_list = [
    /<select class="user-select" name="movefolder-fid">([\s\S]*)<\/select>/,
    /<option value="(\d+)">([^<]*?)<\/option>/g
  ];

  static parse_html_to_search_page(html: string): JmSearchPage {
    // 1. 检查是否失败
    PatternTool.require_not_match(
      html,
      this.pattern_html_search_error,
      match => `${match[1]}: ${match[2]}`
    );

    // 2. 缩小文本范围
    const matchedHtml = PatternTool.require_match(
      html,
      this.pattern_html_search_shorten_for,
      '未匹配到搜索结果'
    ) as string;

    // 3. 提取结果
    const content: [string, any][] = [];
    const [pattern, defaultIdx] = this.pattern_html_search_total;
    const totalStr = PatternTool.match_or_default(html, pattern, '0');
    const total = parseInt(totalStr);

    const albumInfoMatches = [...matchedHtml.matchAll(this.pattern_html_search_album_info_list)];

    for (const match of albumInfoMatches) {
      const [_, albumId, title, labelCategoryText, tagText] = match;
      const tags = [...tagText.matchAll(this.pattern_html_search_tags)].map(m => m[1]);
      content.push([
        albumId, {
          name: title,
          tags: tags
        }
      ]);
    }

    return { content, total };
  }

  static parse_html_to_category_page(html: string): JmSearchPage {
    const content: [string, any][] = [];
    const [pattern, defaultIdx] = this.pattern_html_search_total;
    const totalStr = PatternTool.match_or_default(html, pattern, '0');
    const total = parseInt(totalStr);

    const albumInfoMatches = [...html.matchAll(this.pattern_html_category_album_info_list)];

    for (const match of albumInfoMatches) {
      const [_, albumId, title, tagText] = match;
      const tags = [...tagText.matchAll(this.pattern_html_search_tags)].map(m => m[1]);
      content.push([
        albumId, {
          name: title,
          tags: tags
        }
      ]);
    }

    return { content, total };
  }

  static parse_html_to_favorite_page(html: string): JmFavoritePage {
    const totalMatch = this.pattern_html_favorite_total.exec(html);
    if (!totalMatch) {
      ExceptionTool.raises('未匹配到收藏夹的本子总数');
    }
    const total = parseInt(totalMatch[1]);

    // 收藏夹的本子结果
    const contentMatches = [...html.matchAll(this.pattern_html_favorite_content)];
    const content: [string, any][] = contentMatches.map(
      ([_, aid, atitle]) => [aid, { name: atitle }]
    );

    // 匹配收藏夹列表
    const [p1, p2] = this.pattern_html_favorite_folder_list;
    const folderListTextMatch = p1.exec(html);
    if (!folderListTextMatch) {
      ExceptionTool.raises('未匹配到收藏夹列表');
    }

    const folderListText = folderListTextMatch[1];
    const folderListRaw = [...folderListText.matchAll(p2)];
    const folderList = folderListRaw.map(([_, fid, fname]) => ({ name: fname, FID: fid }));

    return { content, folder_list: folderList, total };
  }

  static parse_api_to_search_page(data: AdvancedDict): JmSearchPage {
    const total: number = parseInt(data.get('total', '0') || '0');
    const content = this.adapt_content(data.get('content', []));
    return { content, total };
  }

  static parse_api_to_favorite_page(data: AdvancedDict): JmFavoritePage {
    const total: number = parseInt(data.get('total', '0'));
    const content = this.adapt_content(data.get('list', []));
    const folderList = data.get('folder_list', []);

    return { content, folder_list: folderList, total };
  }

  static adapt_content(content: any[]): [string, any][] {
    return content.map(item => {
      const itemDict = new AdvancedDict(item);
      const adaptedItem = itemDict.src_dict;
      adaptedItem.tags = adaptedItem.tags || [];
      return [itemDict.get('id'), adaptedItem];
    });
  }
}

class JmApiAdaptTool {
  static field_adapter: Record<string, (string | [string, string])[]> = {
    'JmAlbumDetail': [
      'likes',
      'tags',
      'works',
      'actors',
      'related_list',
      'name',
      ['id', 'album_id'],
      ['author', 'authors'],
      ['total_views', 'views'],
      ['comment_total', 'comment_count'],
    ],
    'JmPhotoDetail': [
      'name',
      'series_id',
      'tags',
      ['id', 'photo_id'],
      ['images', 'page_arr'],
    ]
  };

  static parse_entity(data: Record<string, any>, clazz: any): any {
    const adapter = this.get_adapter(clazz.name);

    const fields: Record<string, any> = {};
    for (const k of adapter) {
      if (typeof k === 'string') {
        const v = data[k];
        fields[k] = v;
      } else if (Array.isArray(k)) {
        const [srcKey, renameKey] = k;
        const v = data[srcKey];
        fields[renameKey] = v;
      }
    }

    if (clazz.name === 'JmAlbumDetail') {
      this.post_adapt_album(data, clazz, fields);
    } else {
      this.post_adapt_photo(data, clazz, fields);
    }

    return new clazz(fields);
  }

  static get_adapter(className: string): (string | [string, string])[] {
    for (const [key, value] of Object.entries(this.field_adapter)) {
      if (key === className) {
        return value;
      }
    }

    ExceptionTool.raises(`不支持的类型: ${className}`);
  }

  static post_adapt_album(data: Record<string, any>, _clazz: any, fields: Record<string, any>): void {
    const series = data['series'] || [];
    const episodeList: [string, string, string, string][] = [];

    for (const chapter of series) {
      const chapterDict = new AdvancedDict(chapter);
      // photo_id, photo_index, photo_title, photo_pub_date
      episodeList.push([
        chapterDict.get('id', ''),
        chapterDict.get('sort', ''),
        chapterDict.get('name', ''),
        null as any
      ]);
    }

    fields['episode_list'] = episodeList;
    for (const it of ['scramble_id', 'page_count', 'pub_date', 'update_date']) {
      fields[it] = '0';
    }
  }

  static post_adapt_photo(data: Record<string, any>, _clazz: any, fields: Record<string, any>): void {
    // 1. 获取sort字段，如果data['series']中没有，使用默认值1
    let sort = 1;
    const series: any[] = data['series'] || []; // series中的sort从1开始

    for (const chapter of series) {
      const chapterDict = new AdvancedDict(chapter);
      if (parseInt(chapterDict.get('id', '0')) === parseInt(data['id'])) {
        sort = chapterDict.get('sort', '1');
        break;
      }
    }

    fields['sort'] = sort;
    // 随机选择一个域名
    fields['data_original_domain'] = JmModuleConfig.DOMAIN_IMAGE_LIST[
      Math.floor(Math.random() * JmModuleConfig.DOMAIN_IMAGE_LIST.length)
    ];
  }
}

class JmImageTool {
  static save_resp_img(resp: any, filepath: string, needConvert = true): void {
    if (needConvert === false) {
      this.save_directly(resp, filepath);
    } else {
      this.save_image(this.open_image(resp.content), filepath);
    }
  }

  static save_image(image: any, filepath: string): void {
    // 在TypeScript中，可能需要依赖于sharp库或其他图像处理库
    // 这里是一个简化的实现
    if (typeof image.save === 'function') {
      image.save(filepath);
    } else if (typeof image.toFile === 'function') {
      image.toFile(filepath);
    } else {
      throw new Error('不支持的图像对象类型');
    }
  }

  static save_directly(resp: any, filepath: string): void {
    // 直接保存响应内容到文件
    fs.writeFileSync(filepath, resp.content);
  }

  static decode_and_save(
    num: number,
    img_src: any,
    decoded_save_path: string
  ): void {
    // 无需解密，直接保存
    if (num === 0) {
      this.save_image(img_src, decoded_save_path);
      return;
    }

    // 使用sharp库处理图像
    // 注意：这里只是一个框架，实际实现需要根据sharp或其他库的API进行调整
    const sharp = require('sharp');
    const w = img_src.width;
    const h = img_src.height;

    // 创建新的解密图片
    const imgDecode = sharp({
      create: {
        width: w,
        height: h,
        channels: 3,
        background: { r: 0, g: 0, b: 0 }
      }
    });

    const over = h % num;
    const move = Math.floor(h / num);

    // 使用composite方法组合图像
    const compositeOperations = [];

    for (let i = 0; i < num; i++) {
      const y_src = h - (move * (i + 1)) - over;
      let y_dst = move * i;
      let currentMove = move;

      if (i === 0) {
        currentMove += over;
      } else {
        y_dst += over;
      }

      // 这部分需要根据实际sharp API进行调整
      // 下面的代码仅为示例框架
      const extractedPart = img_src.extract({
        left: 0,
        top: y_src,
        width: w,
        height: currentMove
      });

      compositeOperations.push({
        input: extractedPart,
        top: y_dst,
        left: 0
      });
    }

    imgDecode.composite(compositeOperations).toFile(decoded_save_path);
  }

  static open_image(fp: string | Buffer): any {
    // 使用sharp库打开图像
    // 实际实现需要根据您选择的图像处理库进行调整
    const sharp = require('sharp');
    return sharp(fp);
  }

  static get_num(scramble_id: string | number, aid: string | number, filename: string): number {
    scramble_id = parseInt(scramble_id.toString());
    aid = parseInt(aid.toString());

    if (aid < scramble_id) {
      return 0;
    } else if (aid < JmMagicConstants.SCRAMBLE_268850) {
      return 10;
    } else {
      const x = aid < JmMagicConstants.SCRAMBLE_421926 ? 10 : 8;
      const s = `${aid}${filename}`;
      const hash = crypto.createHash('md5').update(s).digest('hex');
      const num = hash.charCodeAt(hash.length - 1);
      return (num % x) * 2 + 2;
    }
  }

  static get_num_by_url(scramble_id: string | number, url: string): number {
    return this.get_num(
      scramble_id,
      JmcomicText.parse_to_jm_id(url),
      of_file_name(url, true)
    );
  }

  static get_num_by_detail(detail: JmImageDetail): number {
    return this.get_num(detail.scramble_id, detail.aid, detail.img_file_name);
  }
}

class JmCryptoTool {
  static token_and_tokenparam(
    ts: number,
    ver: string = JmMagicConstants.APP_VERSION,
    secret: string = JmMagicConstants.APP_TOKEN_SECRET
  ): [string, string] {
    // tokenparam: 1700566805,1.6.3
    const tokenparam = `${ts},${ver}`;

    // token: 81498a20feea7fbb7149c637e49702e3
    const token = this.md5hex(`${ts}${secret}`);

    return [token, tokenparam];
  }

  static decode_resp_data(
    data: string,
    ts: number,
    secret: string = JmMagicConstants.APP_DATA_SECRET
  ): string {
    // 1. base64解码
    const dataB64 = Buffer.from(data, 'base64');

    // 2. AES-ECB解密
    const key = Buffer.from(this.md5hex(`${ts}${secret}`), 'utf-8');
    const aes = crypto.createDecipheriv('aes-128-ecb', key, null);
    aes.setAutoPadding(false);
    let dataAes = Buffer.concat([aes.update(dataB64), aes.final()]);

    // 3. 移除末尾的padding
    const paddingLength = dataAes[dataAes.length - 1];
    dataAes = dataAes.slice(0, dataAes.length - paddingLength);

    // 4. 解码为字符串 (json)
    return dataAes.toString('utf-8');
  }

  static md5hex(key: string): string {
    ExceptionTool.require_true(typeof key === 'string', 'key参数需为字符串');
    return crypto.createHash('md5').update(key).digest('hex');
  }
}
