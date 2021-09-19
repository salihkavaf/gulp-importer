import PluginError from 'plugin-error';
import through     from 'through2'
import Path        from 'path'
import afs         from 'fs/promises'

import { Transform } from 'stream';

//---- End of imports ---------------------

interface ImporterOptions {
    encoding?: BufferEncoding,
    ignoreRepeated?: boolean
}

const PLUGIN_NAME = "gulp-importer";
const RGX = /@import\s+["']\s*(.*)\s*["']/gi;

const defaults: ImporterOptions = {
    encoding: "utf-8",
    ignoreRepeated: true
};

class Importer {
    constructor(protected readonly options: ImporterOptions = {}) {
        options = Object.assign(options, defaults);
    }

    private _cache: any = {};
    get cache() {
        return this._cache;
    }

    protected _streamResolveStack: string[] = [];

    import(): Transform {
        const that = this;
        return through.obj(async function (file, enc, cb) {
            if (file.isNull()) {
                cb(null, file);
                return;
            }

            if (file.path === undefined) {
                this.emit("error", new PluginError(PLUGIN_NAME, "The file path is undefined."));
                return cb();
            }

            if (file.isBuffer()) {
                file.contents = await that.resolveBuffer(file.path, file.contents);
            }
            else if (file.isStream()) {
                const stream = that.resolveStream(file.path);
                stream.on("error", this.emit.bind(this, "error"));

                file.contents = file.contents.pipe(stream)
            }

            this.push(file);
            cb();
        })
    }

    // watch(): Transform {
    //     return this.transform( => {
    //         return path;
    //     });
    // }

    private appendCache(target: string, value: string): void {
        target = Importer.encode(target);
        if (!this._cache[target])
            this._cache[target] = [value];
        else
            this._cache[target].push(value);
    }

    private static encode(value: string): string {
        return Buffer.from(value).toString('base64');
    }

    private static decode(value: string): string {
        return Buffer.from(value, "base64").toString("ascii");
    }

    private async resolveBuffer(path: string, buff: Buffer): Promise<Buffer> {
        let content = buff.toString(this.options.encoding);
        content = await this.replace(path, content);

        return Buffer.from(content, this.options.encoding);
    }

    private resolveStream(path: string): Transform {
        const that = this;

        const stream = through(async function (chunk, _, cb) {

            let content = Buffer.from(chunk, that.options.encoding).toString();
            content = await that.replace(path, content, that._streamResolveStack);

            this.push(content);
            cb();
        });

        stream.once("end", () => this._streamResolveStack = []);

        return stream;
    }

    private async replace(path: string, content: string, resolveStack: string[] = []): Promise<string> {
        for (const match of content.matchAll(RGX)) {
            const value = match[0];
            const iPath = Path.resolve(Path.parse(path).dir, match[1].trim());

            // Ignore repeated imports..
            if (this.options.ignoreRepeated) {
                if (resolveStack.includes(iPath)) {
                    content = content.replace(value, "");
                    continue;
                }
                else resolveStack.push(iPath);
            }

            const dependency = await this.readFile(iPath);
            content = content.replace(value, dependency);

            this.appendCache(path, iPath);
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