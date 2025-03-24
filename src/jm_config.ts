/**
 * 辅助函数：随机打乱字符串中的行
 */
function shuffled(lines: string): string[] {
    const ls = lines.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);
    for (let i = ls.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ls[i], ls[j]] = [ls[j], ls[i]];
    }
    return ls;
}

/**
 * 默认日志输出函数
 */
function default_jm_logging(topic: string, msg: string): void {
    const now = new Date();
    const formattedTs = now.toISOString().replace('T', ' ').substr(0, 19);
    console.log(`[${formattedTs}] [main]:【${topic}】${msg}`);
}

/**
 * 字段缓存装饰器
 */
function field_cache(fieldName?: string): MethodDecorator {
    return function(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
        const original = descriptor.value;
        descriptor.value = function(...args: any[]) {
            const field = fieldName || propertyKey.toString();
            if ((this as any)[field] !== undefined && (this as any)[field] !== null) {
                return (this as any)[field];
            }
            const result = original.apply(this, args);
            (this as any)[field] = result;
            return result;
        };
        return descriptor;
    };
}

/**
 * 获取当前时间戳（秒）
 */
function time_stamp(): number {
    return Math.floor(Date.now() / 1000);
}

/**
 * 代理构建器
 */
class ProxyBuilder {
    static system_proxy(): Record<string, string> | null {
        // 在Node.js环境中从环境变量获取系统代理
        const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
        const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;

        if (httpProxy || httpsProxy) {
            return {
                http: httpProxy || httpsProxy || '',
                https: httpsProxy || httpProxy || ''
            };
        }
        return null;
    }
}

/**
 * 禁漫常量
 */
export class JmMagicConstants {
    // 搜索参数-排序
    static readonly ORDER_BY_LATEST = 'mr';
    static readonly ORDER_BY_VIEW = 'mv';
    static readonly ORDER_BY_PICTURE = 'mp';
    static readonly ORDER_BY_LIKE = 'tf';

    static readonly ORDER_MONTH_RANKING = 'mv_m';
    static readonly ORDER_WEEK_RANKING = 'mv_w';
    static readonly ORDER_DAY_RANKING = 'mv_t';

    // 搜索参数-时间段
    static readonly TIME_TODAY = 't';
    static readonly TIME_WEEK = 'w';
    static readonly TIME_MONTH = 'm';
    static readonly TIME_ALL = 'a';

    // 分类参数API接口的category
    static readonly CATEGORY_ALL = '0';  // 全部
    static readonly CATEGORY_DOUJIN = 'doujin';  // 同人
    static readonly CATEGORY_SINGLE = 'single';  // 单本
    static readonly CATEGORY_SHORT = 'short';  // 短篇
    static readonly CATEGORY_ANOTHER = 'another';  // 其他
    static readonly CATEGORY_HANMAN = 'hanman';  // 韩漫
    static readonly CATEGORY_MEIMAN = 'meiman';  // 美漫
    static readonly CATEGORY_DOUJIN_COSPLAY = 'doujin_cosplay';  // cosplay
    static readonly CATEGORY_3D = '3D';  // 3D
    static readonly CATEGORY_ENGLISH_SITE = 'english_site';  // 英文站

    // 副分类
    static readonly SUB_CHINESE = 'chinese';  // 汉化，通用副分类
    static readonly SUB_JAPANESE = 'japanese';  // 日语，通用副分类

    // 其他类（CATEGORY_ANOTHER）的副分类
    static readonly SUB_ANOTHER_OTHER = 'other';  // 其他漫画
    static readonly SUB_ANOTHER_3D = '3d';  // 3D
    static readonly SUB_ANOTHER_COSPLAY = 'cosplay';  // cosplay

    // 同人（SUB_CHINESE）的副分类
    static readonly SUB_DOUJIN_CG = 'CG';  // CG
    static readonly SUB_DOUJIN_CHINESE = JmMagicConstants.SUB_CHINESE;
    static readonly SUB_DOUJIN_JAPANESE = JmMagicConstants.SUB_JAPANESE;

    // 短篇（CATEGORY_SHORT）的副分类
    static readonly SUB_SHORT_CHINESE = JmMagicConstants.SUB_CHINESE;
    static readonly SUB_SHORT_JAPANESE = JmMagicConstants.SUB_JAPANESE;

    // 单本（CATEGORY_SINGLE）的副分类
    static readonly SUB_SINGLE_CHINESE = JmMagicConstants.SUB_CHINESE;
    static readonly SUB_SINGLE_JAPANESE = JmMagicConstants.SUB_JAPANESE;
    static readonly SUB_SINGLE_YOUTH = 'youth';

    // 图片分割参数
    static readonly SCRAMBLE_220980 = 220980;
    static readonly SCRAMBLE_268850 = 268850;
    static readonly SCRAMBLE_421926 = 421926;  // 2023-02-08后改了图片切割算法

    // 移动端API密钥
    static readonly APP_TOKEN_SECRET = '18comicAPP';
    static readonly APP_TOKEN_SECRET_2 = '18comicAPPContent';
    static readonly APP_DATA_SECRET = '185Hcomic3PAPP7R';
    static readonly APP_VERSION = '1.7.8';
}

/**
 * 模块级别共用配置
 */
export class JmModuleConfig {
    // 网站相关
    static readonly PROT = "https://";
    static readonly JM_REDIRECT_URL = `${JmModuleConfig.PROT}jm365.work/3YeBdF`;  // 永久網域，怕走失的小伙伴收藏起来
    static readonly JM_PUB_URL = `${JmModuleConfig.PROT}jmcomic-fb.vip`;
    static readonly JM_CDN_IMAGE_URL_TEMPLATE = JmModuleConfig.PROT + 'cdn-msp.{domain}/media/photos/{photo_id}/{index:05}{suffix}';  // index 从1开始
    static readonly JM_IMAGE_SUFFIX = ['.jpg', '.webp', '.png', '.gif'];

    // JM的异常网页内容
    static readonly JM_ERROR_RESPONSE_TEXT: Record<string, string> = {
        "Could not connect to mysql! Please check your database settings!": "禁漫服务器内部报错",
        "Restricted Access!": "禁漫拒绝你所在ip地区的访问，你可以选择: 换域名/换代理",
    };

    // JM的异常网页code
    static readonly JM_ERROR_STATUS_CODE: Record<number, string> = {
        403: 'ip地区禁止访问/爬虫被识别',
        500: '500: 禁漫服务器内部异常（可能是服务器过载，可以切换ip或稍后重试）',
        520: '520: Web server is returning an unknown error (禁漫服务器内部报错)',
        524: '524: The origin web server timed out responding to this request. (禁漫服务器处理超时)',
    };

    // 分页大小
    static readonly PAGE_SIZE_SEARCH = 80;
    static readonly PAGE_SIZE_FAVORITE = 20;

    // 图片分隔相关
    static SCRAMBLE_CACHE: Record<string, any> = {};

    // 当本子没有作者名字时，顶替作者名字
    static readonly DEFAULT_AUTHOR = 'default_author';

    // cookies，目前只在移动端使用，因为移动端请求接口须携带，但不会校验cookies的内容。
    static APP_COOKIES: any = null;

    // 移动端图片域名
    static DOMAIN_IMAGE_LIST = shuffled(`
    cdn-msp.jmapiproxy1.cc
    cdn-msp.jmapiproxy2.cc
    cdn-msp2.jmapiproxy2.cc
    cdn-msp3.jmapiproxy2.cc
    cdn-msp.jmapinodeudzn.net
    cdn-msp3.jmapinodeudzn.net
    `);

    // 移动端API域名
    static DOMAIN_API_LIST = shuffled(`
    www.jmapiproxyxxx.vip
    www.cdnblackmyth.vip
    www.cdnblackmyth.xyz
    www.cdnxxx-proxy.co
    `);

    static readonly APP_HEADERS_TEMPLATE: Record<string, string> = {
        'Accept-Encoding': 'gzip, deflate',
        'user-agent': 'Mozilla/5.0 (Linux; Android 9; V1938CT Build/PQ3A.190705.11211812; wv) AppleWebKit/537.36 (KHTML, '
                    + 'like Gecko) Version/4.0 Chrome/91.0.4472.114 Safari/537.36',
    };

    static readonly APP_HEADERS_IMAGE: Record<string, string> = {
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'X-Requested-With': 'com.jiaohua_browser',
        'Referer': JmModuleConfig.PROT + JmModuleConfig.DOMAIN_API_LIST[0],
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    };

    // 网页端headers
    static readonly HTML_HEADERS_TEMPLATE: Record<string, string> = {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,'
                + 'application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'zh-CN,zh;q=0.9',
        'cache-control': 'no-cache',
        'dnt': '1',
        'pragma': 'no-cache',
        'priority': 'u=0, i',
        'referer': 'https://18comic.vip/',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 '
                    + 'Safari/537.36',
    };

    // 网页端域名配置
    // 无需配置，默认为null，需要的时候会发起请求获得
    // 使用优先级:
    // 1. DOMAIN_HTML_LIST
    // 2. [DOMAIN_HTML]
    static DOMAIN_HTML: string | null = null;
    static DOMAIN_HTML_LIST: string[] | null = null;

    // 模块级别的可重写类配置
    static CLASS_DOWNLOADER: any = null;
    static CLASS_OPTION: any = null;
    static CLASS_ALBUM: any = null;
    static CLASS_PHOTO: any = null;
    static CLASS_IMAGE: any = null;

    // 客户端注册表
    static REGISTRY_CLIENT: Record<string, any> = {};
    // 插件注册表
    static REGISTRY_PLUGIN: Record<string, any> = {};
    // 异常监听器
    // key: 异常类
    // value: 函数，参数只有异常对象，无需返回值
    // 这个异常类（或者这个异常的子类）的实例将要被raise前，你的listener方法会被调用
    static REGISTRY_EXCEPTION_LISTENER: Record<string, (error: Error) => void> = {};

    // 执行log的函数
    static EXECUTOR_LOG: (topic: string, msg: string) => void = default_jm_logging;

    // 使用固定时间戳
    static FLAG_USE_FIX_TIMESTAMP = true;
    // 移动端Client初始化cookies
    static FLAG_API_CLIENT_REQUIRE_COOKIES = true;
    // log开关标记
    static FLAG_ENABLE_JM_LOG = true;
    // log时解码url
    static FLAG_DECODE_URL_WHEN_LOGGING = true;
    // 当内置的版本号落后时，使用最新的禁漫app版本号
    static FLAG_USE_VERSION_NEWER_IF_BEHIND = true;

    // 关联dir_rule的自定义字段与对应的处理函数
    // 例如:
    // Amyname -> JmModuleConfig.AFIELD_ADVICE['myname'] = lambda album: "自定义名称"
    static AFIELD_ADVICE: Record<string, (album: any) => string> = {};
    static PFIELD_ADVICE: Record<string, (photo: any) => string> = {};

    // 当发生 oserror: [Errno 36] File name too long 时，
    // 把文件名限制在指定个字符以内
    static VAR_FILE_NAME_LENGTH_LIMIT = 100;

    static downloader_class(): any {
        if (JmModuleConfig.CLASS_DOWNLOADER !== null) {
            return JmModuleConfig.CLASS_DOWNLOADER;
        }

        // 这里假设JmDownloader类已在其他文件中定义
        const JmDownloader = require('./jm_downloader').JmDownloader;
        return JmDownloader;
    }

    static option_class(): any {
        if (JmModuleConfig.CLASS_OPTION !== null) {
            return JmModuleConfig.CLASS_OPTION;
        }

        const JmOption = require('./jm_option').JmOption;
        return JmOption;
    }

    static album_class(): any {
        if (JmModuleConfig.CLASS_ALBUM !== null) {
            return JmModuleConfig.CLASS_ALBUM;
        }

        const JmAlbumDetail = require('./jm_entity').JmAlbumDetail;
        return JmAlbumDetail;
    }

    static photo_class(): any {
        if (JmModuleConfig.CLASS_PHOTO !== null) {
            return JmModuleConfig.CLASS_PHOTO;
        }

        const JmPhotoDetail = require('./jm_entity').JmPhotoDetail;
        return JmPhotoDetail;
    }

    static image_class(): any {
        if (JmModuleConfig.CLASS_IMAGE !== null) {
            return JmModuleConfig.CLASS_IMAGE;
        }

        const JmImageDetail = require('./jm_entity').JmImageDetail;
        return JmImageDetail;
    }

    static client_impl_class(client_key: string): any {
        const clazz_dict = JmModuleConfig.REGISTRY_CLIENT;
        const clazz = clazz_dict[client_key];

        if (clazz === undefined) {
            const ExceptionTool = require('./jm_toolkit').ExceptionTool;
            ExceptionTool.raises(`not found client impl class for key: "${client_key}"`);
        }

        return clazz;
    }

    static get_html_domain(postman: any = null): string {
        const JmcomicText = require('./jm_toolkit').JmcomicText;
        return JmcomicText.parse_to_jm_domain(JmModuleConfig.get_html_url(postman));
    }

    static get_html_url(postman: any = null): string {
        postman = postman || JmModuleConfig.new_postman(true);

        const url = postman.with_redirect_catching().get(JmModuleConfig.JM_REDIRECT_URL);
        JmModuleConfig.jm_log('module.html_url', `获取禁漫网页URL: [${JmModuleConfig.JM_REDIRECT_URL}] → [${url}]`);
        return url;
    }

    static get_html_domain_all(postman: any = null): string[] {
        postman = postman || JmModuleConfig.new_postman(true);

        const resp = postman.get(JmModuleConfig.JM_PUB_URL);
        if (resp.status_code !== 200) {
            const ExceptionTool = require('./jm_toolkit').ExceptionTool;
            ExceptionTool.raises_resp(`请求失败，访问禁漫发布页获取所有域名，HTTP状态码为: ${resp.status_code}`, resp);
        }

        const JmcomicText = require('./jm_toolkit').JmcomicText;
        const domain_list = JmcomicText.analyse_jm_pub_html(resp.text);

        JmModuleConfig.jm_log('module.html_domain_all', `获取禁漫网页全部域名: [${resp.url}] → ${domain_list}`);
        return domain_list;
    }

    static get_html_domain_all_via_github(
        postman: any = null,
        template: string = 'https://jmcmomic.github.io/go/{}.html',
        index_range: [number, number] = [300, 309]
    ): Set<string> {
        postman = postman || JmModuleConfig.new_postman({
            headers: {
                'authority': 'github.com',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            }
        });

        const domain_set = new Set<string>();

        const fetch_domain = (url: string) => {
            const resp = postman.get(url, { allow_redirects: false });
            const text = resp.text;
            const JmcomicText = require('./jm_toolkit').JmcomicText;

            for (const domain of JmcomicText.analyse_jm_pub_html(text)) {
                if (domain.startsWith('jm365')) {
                    continue;
                }
                domain_set.add(domain);
            }
        };

        // 生成要请求的URL数组
        const urls: string[] = [];
        for (let i = index_range[0]; i < index_range[1]; i++) {
            urls.push(template.replace('{}', i.toString()));
        }

        // 在多线程环境中请求
        const multi_thread_launcher = require('./common').multi_thread_launcher;
        multi_thread_launcher(urls, fetch_domain);

        return domain_set;
    }

    static new_html_headers(domain: string = '18comic.vip'): Record<string, string> {
        const headers = { ...JmModuleConfig.HTML_HEADERS_TEMPLATE };
        headers['authority'] = domain;
        headers['origin'] = `https://${domain}`;
        headers['referer'] = `https://${domain}`;
        return headers;
    }

    static get_fix_ts_token_tokenparam(): [number, string, string] {
        const ts = time_stamp();
        const JmCryptoTool = require('./jm_toolkit').JmCryptoTool;
        const [token, tokenparam] = JmCryptoTool.token_and_tokenparam(ts);
        return [ts, token, tokenparam];
    }

    static jm_log(topic: string, msg: string): void {
        if (JmModuleConfig.FLAG_ENABLE_JM_LOG === true) {
            JmModuleConfig.EXECUTOR_LOG(topic, msg);
        }
    }

    static disable_jm_log(): void {
        JmModuleConfig.FLAG_ENABLE_JM_LOG = false;
    }

    static new_postman(session: boolean | Record<string, any> = false, options: Record<string, any> = {}): any {
        if (typeof session === 'object') {
            options = session;
            session = false;
        }

        options.impersonate = options.impersonate || 'chrome110';
        options.headers = options.headers || JmModuleConfig.new_html_headers();
        options.proxies = options.proxies || JmModuleConfig.DEFAULT_PROXIES;

        const Postmans = require('./common').Postmans;

        if (session === true) {
            return Postmans.new_session(options);
        }

        return Postmans.new_postman(options);
    }

    // option 相关的默认配置
    static readonly JM_OPTION_VER = '2.1';
    static readonly DEFAULT_CLIENT_IMPL = 'api';  // 默认Client实现类型为网页端
    static readonly DEFAULT_CLIENT_CACHE = null;  // 默认关闭Client缓存
    static readonly DEFAULT_PROXIES = ProxyBuilder.system_proxy();  // 默认使用系统代理

    static readonly DEFAULT_OPTION_DICT: Record<string, any> = {
        'log': null,
        'dir_rule': {'rule': 'Bd_Pname', 'base_dir': null},
        'download': {
            'cache': true,
            'image': {'decode': true, 'suffix': null},
            'threading': {
                'image': 30,
                'photo': null,
            },
        },
        'client': {
            'cache': null,  // see CacheRegistry
            'domain': [],
            'postman': {
                'type': 'cffi',
                'meta_data': {
                    'impersonate': 'chrome110',
                    'headers': null,
                    'proxies': null,
                }
            },
            'impl': null,
            'retry_times': 5,
        },
        'plugins': {
            // 如果插件抛出参数校验异常，只log。（全局配置，可以被插件的局部配置覆盖）
            // 可选值：ignore（忽略），log（打印日志），raise（抛异常）。
            'valid': 'log',
        },
    };

    static option_default_dict(): Record<string, any> {
        // 深拷贝默认配置
        const option_dict = JSON.parse(JSON.stringify(JmModuleConfig.DEFAULT_OPTION_DICT));

        // log
        if (option_dict.log === null) {
            option_dict.log = JmModuleConfig.FLAG_ENABLE_JM_LOG;
        }

        // dir_rule.base_dir
        const dir_rule = option_dict.dir_rule;
        if (dir_rule.base_dir === null) {
            // 获取当前工作目录
            try {
                dir_rule.base_dir = process.cwd();
            } catch {
                dir_rule.base_dir = '.';
            }
        }

        // client cache
        const client = option_dict.client;
        if (client.cache === null) {
            client.cache = JmModuleConfig.DEFAULT_CLIENT_CACHE;
        }

        // client impl
        if (client.impl === null) {
            client.impl = JmModuleConfig.DEFAULT_CLIENT_IMPL;
        }

        // postman proxies
        const meta_data = client.postman.meta_data;
        if (meta_data.proxies === null) {
            // 使用系统代理
            meta_data.proxies = JmModuleConfig.DEFAULT_PROXIES;
        }

        // threading photo
        const dt = option_dict.download.threading;
        if (dt.photo === null) {
            // 获取CPU核心数
            try {
                dt.photo = require('os').cpus().length;
            } catch {
                dt.photo = 4; // 默认值
            }
        }

        return option_dict;
    }

    static register_plugin(plugin_class: any): void {
        const ExceptionTool = require('./jm_toolkit').ExceptionTool;
        ExceptionTool.require_true(
            plugin_class.plugin_key !== undefined,
            `未配置plugin_key, class: ${plugin_class}`
        );
        JmModuleConfig.REGISTRY_PLUGIN[plugin_class.plugin_key] = plugin_class;
    }

    static register_client(client_class: any): void {
        const ExceptionTool = require('./jm_toolkit').ExceptionTool;
        ExceptionTool.require_true(
            client_class.client_key !== undefined,
            `未配置client_key, class: ${client_class}`
        );
        JmModuleConfig.REGISTRY_CLIENT[client_class.client_key] = client_class;
    }

    static register_exception_listener(etype: any, listener: (error: Error) => void): void {
        JmModuleConfig.REGISTRY_EXCEPTION_LISTENER[etype] = listener;
    }
}

export const jm_log = JmModuleConfig.jm_log;
export const disable_jm_log = JmModuleConfig.disable_jm_log;
