// 该文件存放jmcomic的异常机制设计和实现

// 类型定义
type Pattern = RegExp;
type Optional<T> = T | null | undefined;

// 模拟JmModuleConfig
interface JmModuleConfig {
  static REGISTRY_EXCEPTION_LISTENER: Record<new (...args: any[]) => Error, (e: Error) => void>;
}

/**
 * jmcomic模块基础异常类
 */
export class JmcomicException extends Error {
  public static description: string = 'jmcomic 模块异常';
  protected msg: string;
  protected context: Record<string, any>;

  constructor(msg: string, context: Record<string, any>) {
    super(msg);
    this.name = this.constructor.name;
    this.msg = msg;
    this.context = context;
  }

  public from_context(key: string): any {
    return this.context[key];
  }

  public toString(): string {
    return this.msg;
  }
}

/**
 * 响应不符合预期异常
 */
export class ResponseUnexpectedException extends JmcomicException {
  public static description: string = '响应不符合预期异常';

  get resp(): any {
    return this.from_context(ExceptionTool.CONTEXT_KEY_RESP);
  }
}

/**
 * 正则表达式不匹配异常
 */
export class RegularNotMatchException extends JmcomicException {
  public static description: string = '正则表达式不匹配异常';

  /**
   * 可能为null
   */
  get resp(): any {
    return this.context[ExceptionTool.CONTEXT_KEY_RESP] || null;
  }

  get error_text(): string {
    return this.from_context(ExceptionTool.CONTEXT_KEY_HTML);
  }

  get pattern(): Pattern {
    return this.from_context(ExceptionTool.CONTEXT_KEY_RE_PATTERN);
  }
}

/**
 * Json解析异常
 */
export class JsonResolveFailException extends ResponseUnexpectedException {
  public static description: string = 'Json解析异常';
}

/**
 * 不存在本子或章节异常
 */
export class MissingAlbumPhotoException extends ResponseUnexpectedException {
  public static description: string = '不存在本子或章节异常';

  get error_jmid(): string {
    return this.from_context(ExceptionTool.CONTEXT_KEY_MISSING_JM_ID);
  }
}

/**
 * 请求重试全部失败异常
 */
export class RequestRetryAllFailException extends JmcomicException {
  public static description: string = '请求重试全部失败异常';
}

/**
 * 抛异常的工具
 * 1: 能简化 if-raise 语句的编写
 * 2: 有更好的上下文信息传递方式
 */
export class ExceptionTool {
  static CONTEXT_KEY_RESP: string = 'resp';
  static CONTEXT_KEY_HTML: string = 'html';
  static CONTEXT_KEY_RE_PATTERN: string = 'pattern';
  static CONTEXT_KEY_MISSING_JM_ID: string = 'missing_jm_id';

  /**
   * 抛出异常
   *
   * @param msg 异常消息
   * @param context 异常上下文数据
   * @param etype 异常类型，默认使用 JmcomicException
   */
  static raises(
    msg: string,
    context: Record<string, any> = {},
    etype: new (msg: string, context: Record<string, any>) => JmcomicException = JmcomicException
  ): never {
    // 异常对象
    const e = new etype(msg, context);

    // 异常处理建议
    this.notify_all_listeners(e);

    throw e;
  }

  /**
   * 抛出正则表达式不匹配异常
   */
  static raises_regex(
    msg: string,
    html: string,
    pattern: Pattern
  ): never {
    return this.raises(
      msg,
      {
        [this.CONTEXT_KEY_HTML]: html,
        [this.CONTEXT_KEY_RE_PATTERN]: pattern,
      },
      RegularNotMatchException
    );
  }

  /**
   * 抛出响应不符合预期异常
   */
  static raises_resp(
    msg: string,
    resp: any,
    etype: new (msg: string, context: Record<string, any>) => JmcomicException = ResponseUnexpectedException
  ): never {
    return this.raises(
      msg,
      {
        [this.CONTEXT_KEY_RESP]: resp
      },
      etype
    );
  }

  /**
   * 抛出本子/章节的异常
   * @param resp 响应对象
   * @param jmid 禁漫本子/章节id
   */
  static raise_missing(resp: any, jmid: string): never {
    // 在TypeScript中需要导入JmcomicText或在这里模拟该功能
    const url = `https://18comic.org/album/${jmid}`; // 简化实现，实际应使用JmcomicText.format_album_url

    const req_type = url.includes("album") ? "本子" : "章节";
    return this.raises(
      `请求的${req_type}不存在！(${url})\n` +
      '原因可能为:\n' +
      `1. id有误，检查你的${req_type}id\n` +
      '2. 该漫画只对登录用户可见，请配置你的cookies，或者使用移动端Client（api）\n',
      {
        [this.CONTEXT_KEY_RESP]: resp,
        [this.CONTEXT_KEY_MISSING_JM_ID]: jmid,
      },
      MissingAlbumPhotoException
    );
  }

  /**
   * 条件断言，不满足条件时抛出异常
   */
  static require_true(case_value: boolean, msg: string): void {
    if (case_value) {
      return;
    }

    this.raises(msg);
  }

  /**
   * 替换旧的异常执行器
   */
  static replace_old_exception_executor(
    raises: (old: typeof ExceptionTool['raises'], msg: string, context: Record<string, any>) => void
  ): void {
    const old = this.raises;

    this.raises = function(
      msg: string,
      context: Record<string, any> = {},
      _etype?: new (msg: string, context: Record<string, any>) => JmcomicException
    ): never {
      raises(old, msg, context);
      throw new Error("This should never be reached");
    } as any;
  }

  /**
   * 通知所有监听器
   */
  static notify_all_listeners(e: JmcomicException): void {
    const registry = (global as any).JmModuleConfig?.REGISTRY_EXCEPTION_LISTENER || {};

    for (const [acceptType, listener] of Object.entries(registry)) {
      if (e instanceof (acceptType as any)) {
        (listener as Function)(e);
      }
    }
  }
}
