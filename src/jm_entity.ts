import { lruCache } from './utils';

// 假设这些模块和函数已经在其他文件中定义
import { JmModuleConfig } from './jm_config';
import { ExceptionTool, JmcomicText } from './jm_toolkit';
import { time_stamp, jm_log } from './common';

// 接口和类型定义
export interface Downloadable {
    save_path: string;
    exists: boolean;
    skip: boolean;
}

export class JmBaseEntity {
    to_file(filepath: string): void {
        // 假设 PackerUtil 已在别处定义
        // PackerUtil.pack(this, filepath);
    }

    static is_image(): boolean {
        return false;
    }

    static is_photo(): boolean {
        return false;
    }

    static is_album(): boolean {
        return false;
    }

    static is_page(): boolean {
        return false;
    }
}

export abstract class IndexedEntity<T> {
    abstract getindex(index: number): T;
    abstract length(): number;

    getItem(item: number | { start?: number, stop?: number, step?: number }): T | T[] {
        if (typeof item === 'object') {
            const start = item.start || 0;
            const stop = item.stop || this.length();
            const step = item.step || 1;
            const result: T[] = [];
            for (let i = start; i < stop; i += step) {
                result.push(this.getindex(i));
            }
            return result;
        } else if (typeof item === 'number') {
            return this.getindex(item);
        } else {
            throw new TypeError(`Invalid item type for ${this.constructor.name}`);
        }
    }

    *[Symbol.iterator](): Iterator<T> {
        for (let index = 0; index < this.length(); index++) {
            yield this.getindex(index);
        }
    }
}

export abstract class DetailEntity extends JmBaseEntity implements IndexedEntity<any> {
    abstract getindex(index: number): any;
    abstract length(): number;

    abstract get id(): string;
    abstract get title(): string;
    abstract get author(): string;

    get oname(): string {
        const oname = JmcomicText.parse_orig_album_name(this.title);
        if (oname !== null) {
            return oname;
        }

        jm_log('entity', `无法提取出原album名字: ${this.title}`);
        return this.title;
    }

    get authoroname(): string {
        return `【${this.author}】${this.oname}`;
    }

    get idoname(): string {
        return `[${this.id}] ${this.oname}`;
    }

    toString(): string {
        return `${this.constructor.name}{${this.id}: ${this.title}}`;
    }

    static __alias__(): string {
        const cls_name = this.name;
        return cls_name.substring(cls_name.indexOf("m") + 1, cls_name.lastIndexOf("Detail")).toLowerCase();
    }

    static get_dirname(detail: DetailEntity, ref: string): string {
        const advice_func = (detail instanceof JmAlbumDetail
            ? JmModuleConfig.AFIELD_ADVICE
            : JmModuleConfig.PFIELD_ADVICE
        )[ref];

        if (advice_func !== undefined) {
            return advice_func(detail);
        }

        return (detail as any)[ref];
    }
}

export class JmImageDetail extends JmBaseEntity implements Downloadable {
    aid: string;
    scramble_id: string;
    img_url: string;
    img_file_name: string;
    img_file_suffix: string;
    from_photo: JmPhotoDetail | null;
    query_params: string | null;
    index: number;

    save_path: string = '';
    exists: boolean = false;
    skip: boolean = false;

    constructor(
        aid: string | number,
        scramble_id: string | number,
        img_url: string,
        img_file_name: string,
        img_file_suffix: string,
        from_photo: JmPhotoDetail | null = null,
        query_params: string | null = null,
        index: number = -1
    ) {
        super();
        if (scramble_id === null || (typeof scramble_id === 'string' && scramble_id === '')) {
            ExceptionTool.raises('图片的scramble_id不能为空');
        }

        this.aid = String(aid);
        this.scramble_id = String(scramble_id);
        this.img_url = img_url;
        this.img_file_name = img_file_name;
        this.img_file_suffix = img_file_suffix;
        this.from_photo = from_photo;
        this.query_params = query_params;
        this.index = index;
    }

    get filename_without_suffix(): string {
        return this.img_file_name;
    }

    get filename(): string {
        return this.img_file_name + this.img_file_suffix;
    }

    get is_gif(): boolean {
        return this.img_file_suffix === '.gif';
    }

    get download_url(): string {
        if (this.query_params === null) {
            return this.img_url;
        }
        return `${this.img_url}?${this.query_params}`;
    }

    static of(
        photo_id: string,
        scramble_id: string,
        data_original: string,
        from_photo: JmPhotoDetail | null = null,
        query_params: string | null = null,
        index: number = -1
    ): JmImageDetail {
        const x = data_original.lastIndexOf('/');
        const y = data_original.lastIndexOf('.');

        return new JmImageDetail(
            photo_id,
            scramble_id,
            data_original,
            data_original.substring(x + 1, y),
            data_original.substring(y),
            from_photo,
            query_params,
            index
        );
    }

    get tag(): string {
        return `${this.aid}/${this.img_file_name}${this.img_file_suffix} [${this.index}/${this.from_photo ? this.from_photo.length() : '?'}]`;
    }

    static is_image(): boolean {
        return true;
    }
}

export class JmPhotoDetail extends DetailEntity implements Downloadable {
    photo_id: string;
    scramble_id: string;
    name: string;
    sort: number;
    _tags: string;
    _series_id: number;
    _author: string | null;
    from_album: JmAlbumDetail | null;
    index: number;
    page_arr: string[];
    data_original_domain: string | null;
    data_original_0: string | null;
    data_original_query_params: string | null;

    save_path: string = '';
    exists: boolean = false;
    skip: boolean = false;

    constructor(
        photo_id: string | number,
        scramble_id: string | number,
        name: string,
        series_id: string | number,
        sort: string | number,
        tags: string = '',
        page_arr: string[] | string | null = null,
        data_original_domain: string | null = null,
        data_original_0: string | null = null,
        author: string | null = null,
        from_album: JmAlbumDetail | null = null
    ) {
        super();
        this.photo_id = String(photo_id);
        this.scramble_id = String(scramble_id);
        this.name = String(name).trim();
        this.sort = Number(sort);
        this._tags = tags;
        this._series_id = Number(series_id);
        this._author = author;
        this.from_album = from_album;
        this.index = this.album_index;

        if (typeof page_arr === 'string') {
            page_arr = JSON.parse(page_arr);
        }
        this.page_arr = page_arr || [];
        this.data_original_domain = data_original_domain;
        this.data_original_0 = data_original_0;
        this.data_original_query_params = null;
    }

    get is_single_album(): boolean {
        return this._series_id === 0;
    }

    get tags(): string[] {
        if (this.from_album !== null) {
            return this.from_album.tags;
        }

        const tag_str = this._tags;
        if (tag_str.includes(',')) {
            return tag_str.split(',');
        } else {
            return tag_str.split(/\s+/);
        }
    }

    get indextitle(): string {
        return `第${this.album_index}話 ${this.name}`;
    }

    get album_id(): string {
        return this.is_single_album ? this.photo_id : String(this._series_id);
    }

    get album_index(): number {
        if (this.is_single_album && this.sort === 2) {
            return 1;
        }
        return this.sort;
    }

    get author(): string {
        if (this.from_album !== null) {
            return this.from_album.author;
        }

        if (this._author !== null && this._author !== '') {
            return this._author.trim();
        }

        return JmModuleConfig.DEFAULT_AUTHOR;
    }

    get id(): string {
        return this.photo_id;
    }

    get title(): string {
        return this.name;
    }

    create_image_detail(index: number): JmImageDetail {
        const length = this.page_arr.length;
        if (index >= length) {
            throw new IndexError(`image index out of range for photo-${this.photo_id}: ${index} >= ${length}`);
        }

        const data_original = this.get_img_data_original(this.page_arr[index]);

        return JmModuleConfig.image_class().of(
            this.photo_id,
            this.scramble_id,
            data_original,
            this,
            this.data_original_query_params,
            index + 1
        );
    }

    get_img_data_original(img_name: string): string {
        const domain = this.data_original_domain;
        ExceptionTool.require_true(domain !== null, `图片域名为空: ${domain}`);
        return `${JmModuleConfig.PROT}${domain}/media/photos/${this.photo_id}/${img_name}`;
    }

    get_data_original_query_params(data_original_0: string | null): string {
        if (data_original_0 === null) {
            return `v=${time_stamp()}`;
        }

        const index = data_original_0.lastIndexOf('?');
        if (index === -1) {
            return `v=${time_stamp()}`;
        }

        return data_original_0.substring(index + 1);
    }

    private imageCache = new Map<number, JmImageDetail>();

    getindex(index: number): JmImageDetail {
        if (!this.imageCache.has(index)) {
            this.imageCache.set(index, this.create_image_detail(index));
        }
        return this.imageCache.get(index)!;
    }

    length(): number {
        return this.page_arr.length;
    }

    static is_photo(): boolean {
        return true;
    }
}

export class JmAlbumDetail extends DetailEntity implements Downloadable {
    album_id: string;
    scramble_id: string;
    name: string;
    page_count: number;
    pub_date: string;
    update_date: string;
    likes: string;
    views: string;
    comment_count: number;
    works: string[];
    actors: string[];
    tags: string[];
    authors: string[];
    episode_list: [string, string, string, string][];
    related_list: any[] | null;

    save_path: string = '';
    exists: boolean = false;
    skip: boolean = false;

    constructor(
        album_id: string | number,
        scramble_id: string | number,
        name: string,
        episode_list: [string, string, string, string][],
        page_count: string | number,
        pub_date: string,
        update_date: string,
        likes: string,
        views: string,
        comment_count: string | number,
        works: string[],
        actors: string[],
        authors: string[],
        tags: string[],
        related_list: any[] | null = null
    ) {
        super();
        this.album_id = String(album_id);
        this.scramble_id = String(scramble_id);
        this.name = String(name).trim();
        this.page_count = Number(page_count);
        this.pub_date = pub_date;
        this.update_date = update_date;
        this.likes = likes;
        this.views = views;
        this.comment_count = Number(comment_count);
        this.works = works;
        this.actors = actors;
        this.tags = tags;
        this.authors = authors;

        if (episode_list.length === 0) {
            episode_list = [[this.album_id, "1", name, pub_date]];
        } else {
            episode_list = JmAlbumDetail.distinct_episode(episode_list);
        }

        this.episode_list = episode_list;
        this.related_list = related_list;
    }

    get author(): string {
        if (this.authors.length >= 1) {
            return this.authors[0];
        }
        return JmModuleConfig.DEFAULT_AUTHOR;
    }

    get id(): string {
        return this.album_id;
    }

    get title(): string {
        return this.name;
    }

    static distinct_episode(episode_list: [string, string, string, string][]): [string, string, string, string][] {
        episode_list.sort((a, b) => parseInt(a[1]) - parseInt(b[1]));
        const ret = [episode_list[0]];

        for (let i = 1; i < episode_list.length; i++) {
            if (ret[ret.length - 1][1] !== episode_list[i][1]) {
                ret.push(episode_list[i]);
            }
        }

        return ret;
    }

    create_photo_detail(index: number): JmPhotoDetail {
        const length = this.episode_list.length;
        if (index >= length) {
            throw new IndexError(`photo index out of range for album-${this.album_id}: ${index} >= ${length}`);
        }

        const [pid, pindex, pname, _pub_date] = this.episode_list[index];

        return new JmPhotoDetail(
            pid,
            this.scramble_id,
            pname,
            this.album_id,
            pindex,
            '',
            null,
            null,
            null,
            null,
            this
        );
    }

    private photoCache = new Map<number, JmPhotoDetail>();

    getindex(index: number): JmPhotoDetail {
        if (!this.photoCache.has(index)) {
            this.photoCache.set(index, this.create_photo_detail(index));
        }
        return this.photoCache.get(index)!;
    }

    length(): number {
        return this.episode_list.length;
    }

    static is_album(): boolean {
        return true;
    }
}

type ContentItem = [string, Record<string, any>];

export class JmPageContent extends JmBaseEntity implements IndexedEntity<ContentItem> {
    content: ContentItem[];
    total: number;

    constructor(content: ContentItem[], total: number) {
        super();
        this.content = content;
        this.total = total;
    }

    get page_count(): number {
        const page_size = this.page_size;
        return Math.ceil(this.total / page_size);
    }

    get page_size(): number {
        throw new Error("NotImplementedError");
    }

    *iter_id(): Generator<string> {
        for (const [aid] of this.content) {
            yield aid;
        }
    }

    *iter_id_title(): Generator<[string, string]> {
        for (const [aid, ainfo] of this.content) {
            yield [aid, ainfo['name']];
        }
    }

    *iter_id_title_tag(): Generator<[string, string, string[]]> {
        for (const [aid, ainfo] of this.content) {
            ainfo['tags'] = ainfo['tags'] || [];
            yield [aid, ainfo['name'], ainfo['tags']];
        }
    }

    getindex(index: number): ContentItem {
        return this.content[index];
    }

    length(): number {
        return this.content.length;
    }

    static is_page(): boolean {
        return true;
    }
}

export class JmSearchPage extends JmPageContent {
    album?: JmAlbumDetail;

    get page_size(): number {
        return JmModuleConfig.PAGE_SIZE_SEARCH;
    }

    get is_single_album(): boolean {
        return this.album !== undefined;
    }

    get single_album(): JmAlbumDetail {
        return this.album!;
    }

    static wrap_single_album(album: JmAlbumDetail): JmSearchPage {
        const page = new JmSearchPage([
            [album.album_id, {
                'name': album.name,
                'tags': album.tags,
            }]
        ], 1);
        page.album = album;
        return page;
    }
}

export class JmCategoryPage extends JmSearchPage {}

export class JmFavoritePage extends JmPageContent {
    folder_list: any[];

    constructor(content: ContentItem[], folder_list: any[], total: number) {
        super(content, total);
        this.folder_list = folder_list;
    }

    get page_size(): number {
        return JmModuleConfig.PAGE_SIZE_FAVORITE;
    }

    *iter_folder_id_name(): Generator<[string, string]> {
        for (const folder_info of this.folder_list) {
            const fid = folder_info['FID'];
            const fname = folder_info['name'];
            yield [fid, fname];
        }
    }
}

// 辅助类和错误类型
class IndexError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "IndexError";
    }
}
