import { JmAlbumDetail, JmDownloader, JmModuleConfig, JmcomicText, ExceptionTool, PackerUtil } from './jm_downloader';

// 定义返回类型
type DownloadApiRet = [JmAlbumDetail, JmDownloader];

// 定义回调函数类型
type DownloadCallback = (album: JmAlbumDetail, downloader: JmDownloader) => void;

/**
 * 批量下载 album / photo
 *
 * 一个album/photo，对应一个线程，对应一个option
 *
 * @param downloadApi 下载api
 * @param jmIdIter jmid (album_id, photo_id) 的迭代器
 * @param option 下载选项，所有的jmid共用一个option
 * @param downloader 下载器类
 */
export function downloadBatch(
  downloadApi: Function,
  jmIdIter: Iterable<any>,
  option?: any,
  downloader?: any
): Set<DownloadApiRet> {
  if (option === undefined) {
    option = JmModuleConfig.optionClass().default();
  }

  const result = new Set<DownloadApiRet>();

  const callback = function(...ret: any) {
    result.add(ret as DownloadApiRet);
  };

  multiThreadLauncher({
    iterObjs: new Set(
      Array.from(jmIdIter).map(jmid => JmcomicText.parseToJmId(jmid))
    ),
    applyEachObjFunc: (aid: any) => downloadApi(aid, option, downloader, callback),
    waitFinish: true
  });

  return result;
}

/**
 * 下载一个本子（album），包含其所有的章节（photo）
 *
 * 当jmAlbumId不是string或number时，视为批量下载，相当于调用 downloadBatch(downloadAlbum, jmAlbumId, option, downloader)
 *
 * @param jmAlbumId 本子的禁漫车号
 * @param option 下载选项
 * @param downloader 下载器类
 * @param callback 返回值回调函数，可以拿到 album 和 downloader
 * @returns 对应的本子实体类，下载器（如果是上述的批量情况，返回值为downloadBatch的返回值）
 */
export function downloadAlbum(
  jmAlbumId: string | number | Iterable<any>,
  option?: any,
  downloader?: any,
  callback?: DownloadCallback
): DownloadApiRet | Set<DownloadApiRet> {
  if (typeof jmAlbumId !== 'string' && typeof jmAlbumId !== 'number') {
    return downloadBatch(downloadAlbum, jmAlbumId, option, downloader);
  }

  const dler = newDownloader(option, downloader);
  try {
    const album = dler.downloadAlbum(jmAlbumId);

    if (callback) {
      callback(album, dler);
    }

    return [album, dler] as DownloadApiRet;
  } finally {
    if (typeof dler.close === 'function') {
      dler.close();
    }
  }
}

/**
 * 下载一个章节（photo），参数同 downloadAlbum
 */
export function downloadPhoto(
  jmPhotoId: string | number | Iterable<any>,
  option?: any,
  downloader?: any,
  callback?: DownloadCallback
): DownloadApiRet | Set<DownloadApiRet> {
  if (typeof jmPhotoId !== 'string' && typeof jmPhotoId !== 'number') {
    return downloadBatch(downloadPhoto, jmPhotoId, option, downloader);
  }

  const dler = newDownloader(option, downloader);
  try {
    const photo = dler.downloadPhoto(jmPhotoId);

    if (callback) {
      callback(photo, dler);
    }

    return [photo, dler] as DownloadApiRet;
  } finally {
    if (typeof dler.close === 'function') {
      dler.close();
    }
  }
}

/**
 * 创建新下载器
 */
export function newDownloader(option?: any, downloader?: any): JmDownloader {
  if (option === undefined) {
    option = JmModuleConfig.optionClass().default();
  }

  if (downloader === undefined) {
    downloader = JmModuleConfig.downloaderClass();
  }

  return new downloader(option);
}

/**
 * 从文件创建选项
 */
export function createOptionByFile(filepath: string): any {
  return JmModuleConfig.optionClass().fromFile(filepath);
}

/**
 * 从环境变量创建选项
 */
export function createOptionByEnv(envName: string = 'JM_OPTION_PATH'): any {
  const filepath = process.env[envName] || null;
  ExceptionTool.requireTrue(filepath !== null,
    `未配置环境变量: ${envName}，请配置为option的文件路径`);
  return createOptionByFile(filepath);
}

/**
 * 从字符串创建选项
 */
export function createOptionByStr(text: string, mode?: string): any {
  if (mode === undefined) {
    mode = PackerUtil.modeYml;
  }
  const [data] = PackerUtil.unpackByStr(text, mode);
  return JmModuleConfig.optionClass().construct(data);
}

// 创建选项（别名）
export const createOption = createOptionByFile;

// 多线程启动器接口
interface MultiThreadLauncherOptions {
  iterObjs: Set<any>;
  applyEachObjFunc: (obj: any) => void;
  waitFinish: boolean;
}

/**
 * 多线程启动器
 */
function multiThreadLauncher(options: MultiThreadLauncherOptions): void {
  const { iterObjs, applyEachObjFunc, waitFinish } = options;

  const promises = Array.from(iterObjs).map(obj => {
    return new Promise<void>((resolve) => {
      applyEachObjFunc(obj);
      resolve();
    });
  });

  if (waitFinish) {
    Promise.all(promises).then(() => {
      console.log('所有下载任务已完成');
    });
  }
}
