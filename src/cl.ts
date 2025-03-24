/**
 * command-line usage
 *
 * for example, download album 123 456, photo 333:
 *
 * $ jmcomic 123 456 p333 --option="D:/option.yml"
 *
 */
import * as path from 'path';
import * as fs from 'fs';
import { ArgumentParser } from 'argparse';
import { JmcomicText } from './jm_toolkit';
import { jm_log, create_option, JmOption, download_album, download_photo } from './api';

function getEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value;
}

class JmcomicUI {
  optionPath: string | null = null;
  rawIdList: string[] = [];
  albumIdList: string[] = [];
  photoIdList: string[] = [];

  parseArg(): void {
    const parser = new ArgumentParser({
      prog: 'jmcomic',
      description: 'JMComic Command Line Downloader'
    });

    parser.addArgument('id_list', {
      nargs: '*',
      help: 'input all album/photo ids that you want to download, separating them by spaces. ' +
            'Need add a "p" prefix to indicate a photo id, such as `123 456 p333`.',
      defaultValue: []
    });

    parser.addArgument('--option', {
      help: 'path to the option file, you can also specify it by env `JM_OPTION_PATH`',
      type: 'string',
      defaultValue: getEnv('JM_OPTION_PATH', '')
    });

    const args = parser.parseArgs();
    const option = args.option;

    if (option.length === 0 || option === "''") {
      this.optionPath = null;
    } else {
      this.optionPath = path.resolve(option);
    }

    this.rawIdList = args.id_list;
    this.parseRawId();
  }

  parseRawId(): void {
    const parse = (text: string): string => {
      try {
        return JmcomicText.parseToJmId(text);
      } catch (e) {
        console.error(e.message);
        process.exit(1);
        return ''; // 这行代码永远不会执行，但TypeScript需要返回值
      }
    };

    for (const rawId of this.rawIdList) {
      if (rawId.startsWith('p')) {
        this.photoIdList.push(parse(rawId.substring(1)));
      } else if (rawId.startsWith('a')) {
        this.albumIdList.push(parse(rawId.substring(1)));
      } else {
        this.albumIdList.push(parse(rawId));
      }
    }
  }

  main(): void {
    this.parseArg();
    jm_log('command_line',
           `start downloading...\n` +
           `- using option: [${this.optionPath || "default"}]\n` +
           `to be downloaded: \n` +
           `- album: ${this.albumIdList}\n` +
           `- photo: ${this.photoIdList}`);

    let option;
    if (this.optionPath !== null) {
      option = create_option(this.optionPath);
    } else {
      option = JmOption.default();
    }

    this.run(option);
  }

  run(option: any): void {
    if (this.albumIdList.length === 0) {
      download_photo(this.photoIdList, option);
    } else if (this.photoIdList.length === 0) {
      download_album(this.albumIdList, option);
    } else {
      // 同时下载album和photo
      class MultiTaskLauncher {
        tasks: Promise<any>[] = [];

        createTask(target: Function, args: any[]): void {
          this.tasks.push(Promise.resolve(target(...args)));
        }

        waitFinish(): Promise<any> {
          return Promise.all(this.tasks);
        }
      }

      const launcher = new MultiTaskLauncher();

      launcher.createTask(
        download_album,
        [this.albumIdList, option]
      );
      launcher.createTask(
        download_photo,
        [this.photoIdList, option]
      );

      launcher.waitFinish().then(() => {
        console.log('All downloads completed');
      }).catch(error => {
        console.error('Error during download:', error);
      });
    }
  }
}

function main(): void {
  new JmcomicUI().main();
}

// 如果直接运行脚本，则执行main函数
if (require.main === module) {
  main();
}

export { JmcomicUI, main };
