import PluginError from 'plugin-error';
import through     from 'through2';
import Path        from 'path';
import afs         from 'fs/promises'
import fs          from 'fs';
import File        from 'vinyl';

import { PassThrough, Transform, TransformCallback } from 'stream';

//---- End of imports ---------------------

interface ImporterOptions {
    encoding?: BufferEncoding,
    importOnce?: boolean
}

type FileCache = Record<string, Record<string, File>>

const PLUGIN_NAME = "gulp-importer";
const RGX = /@import\s+["']\s*(.*)\s*["']/gi;

const defaults: ImporterOptions = {
    encoding: "utf-8",
    importOnce: true
};

/**
 * Provides the gulp API for importing any kind of file to any kind of file.
 */
class Importer {
    /**
     * Initializes a new instance of this class.
     * @param options The configuration options.
     */
    constructor(protected readonly options: ImporterOptions = {}) {
        options = Object.assign(options, defaults);
    }

    private _cache: FileCache = {};

    /** The dependency cache under watch. */
    get cache(): FileCache {
        return this._cache;
    }

    /** A stream specific resolve stack, used to insure all chunks in a stream were appropriatly resolved. */
    protected _streamResolveStack: string[] = [];

    /**
     * Resolves the import statements in the recieved buffers/streams.
     * @returns {Transform} The transform stream to be added to the pipe chain.
     */
    import(): Transform {
        const that = this;
        return through.obj(async function (file, enc, cb) {
            if (!that.validate(this, file, cb))
                return;

            if (file.isBuffer()) {
                file.contents = await that.resolveBuffer(file);
            }
            else if (file.isStream()) {
                const stream = that.resolveStream(file);
                stream.on("error", this.emit.bind(this, "error"));

                file.contents = file.contents.pipe(stream)
            }

            this.push(file);
            cb();
        })
    }

    watch(): Transform {
        const that = this;
        return through.obj(async function (file, enc, cb) {
            if (!that.validate(this, file, cb))
                return;

            if (file.isBuffer()) {
                // TODO Add buffer support..
            }
            else if (file.isStream()) {
                const list = that.resolveDependency(file.path);
                list.forEach(ref => this.push(ref));

                file.contents = file.contents.pipe(new PassThrough());
                this.push(file);
                cb();
            }
        });
    }

    private resolveDependency(path: string): File[] {
        let fileList = [];
        const encoded = Importer.encode(Path.resolve(path));

        if (this._cache.hasOwnProperty(encoded))
            for (let [_, value] of Object.entries(this._cache[encoded])) {
                const refFile = this.resolveReference(value);
                fileList.push(refFile);
            }

        return fileList;
    }

    private resolveReference(file: File): File {
        const rStream = fs.createReadStream(file.path, { encoding: this.options.encoding });
        const tStream = this.resolveStream(file);
        
        return new File({
            cwd: file.cwd,
            base: file.base,
            path: file.path,
            contents: rStream.pipe(tStream)
        });
    }

    private validate(stream: Transform, file: any, cb: TransformCallback): boolean {
        if (file.isNull()) {
            cb(null, file);
            return false;
        }

        if (file.path === undefined) {
            stream.emit("error", new PluginError(PLUGIN_NAME, "The file path is undefined."));
            cb();
            return false;
        }
        return true;
    }

    private appendCache(dependency: string, target: any): void {
        dependency = Importer.encode(dependency);
        const file = new File({
            cwd: target.cwd,
            base: target.base,
            path: Path.resolve(target.path)
        });

        const path = Importer.encode(file.path);

        if (!this._cache[dependency])
            this._cache[dependency] = { [path]: file };
        else
        if (!this._cache[dependency].hasOwnProperty(path)) {
            this._cache[dependency][path] = file;
        }
    }
    private static encode(value: string): string {
        return Buffer.from(value).toString('base64');
    }

    private async resolveBuffer(file: any): Promise<Buffer> {
        let content = file.contents.toString(this.options.encoding);
        content = await this.replace(file, content);

        return Buffer.from(content, this.options.encoding);
    }

    private resolveStream(file: any): Transform {
        const that = this;
        const stream = through(async function (chunk, _, cb) {

            let content = Buffer.from(chunk, that.options.encoding).toString();
            content = await that.replace(file, content, that._streamResolveStack);

            this.push(content);
            cb();
        });

        stream.once("end", () => this._streamResolveStack = []);

        return stream;
    }

    private async replace(file: any, content: string, resolveStack: string[] = []): Promise<string> {
        for (const match of content.matchAll(RGX)) {
            const value = match[0];
            const dPath = Path.resolve(Path.parse(file.path).dir, match[1].trim()); // Dependency path.

            // Ignore repeated imports..
            if (this.options.importOnce) {
                if (resolveStack.includes(dPath)) {
                    content = content.replace(value, "");
                    continue;
                }
                else resolveStack.push(dPath);
            }

            const dependency = await this.readFile(dPath);
            content = content.replace(value, dependency);

            this.appendCache(dPath, file);
        }
        return content;
    }

    private async readFile(path: string): Promise<string> {
        try {
            const content = await afs.readFile(path, { encoding: this.options.encoding });
            if (content instanceof Buffer)
                return content.toString();
            else
                return content;
        }
        catch (error) {
            throw new PluginError(PLUGIN_NAME, `The path "${path}" doesn't exist!`);
        }
    };
}

export default Importer;