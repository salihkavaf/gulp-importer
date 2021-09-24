import PluginError from 'plugin-error';
import through     from 'through2';
import Path        from 'path';
import fs          from 'fs';
import File        from 'vinyl';
import log         from 'fancy-log'

import { promises as afs } from 'fs'
import { Transform, TransformCallback } from 'stream';

//---- End of imports ---------------------

interface ImporterOptions {
    [key: string]: any;

    regexPattern?: RegExp;
    encoding?: BufferEncoding;
    importOnce?: boolean;
    dependencyOutput?: "primary" | "dependant" | "all",
    disableLog?: boolean,
    detailedLog?: boolean
}

type FileCache = Record<string, Record<string, File>>

const PLUGIN_NAME = "gulp-importer";
const RGX = /@{0,1}import\s+["']\s*(.*)\s*["'];{0,1}/gi;

const defaults: ImporterOptions = {
    regexPattern: RGX,
    encoding: "utf-8",
    importOnce: true,
    dependencyOutput: "primary",
    disableLog: false,
    detailedLog: false
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
        for (const key in defaults)
            if (!options[key])
                options[key] = defaults[key];
    }

    private _cache: FileCache = {};

    /** The dependancy cache under watch. */
    get cache(): FileCache {
        return this._cache;
    }

    /** A stream specific resolve stack, used to insure all chunks in a stream were appropriatly resolved. */
    protected _streamResolveStack: string[] = [];

    /**
     * Resolves the import statements in the recieved buffers/streams.
     * @returns {Transform} The transform stream to be added to the pipe chain.
     */
    execute(): Transform {
        const that = this;
        return through.obj(async function (file, enc, cb) {
            if (!that.validate(this, file, cb))
                return;

            try {
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
            }
            catch (err) {
                cb(new PluginError(PLUGIN_NAME, err as Error));
            }
        })
    }

    /**
     * Updates imports for dependancies when a primary file gets modified.
     * @returns The transform stream to be added to the pipe chain.
     */
    updateDependency(): Transform {
        const that = this;
        return through.obj(async function (file, _, cb) {
            if (!that.validate(this, file, cb))
                return;

            const logInfo = (num: number) => log.info(`${num} dependant file${num > 1 ? "s" : ""}...`);

            try {
                if (file.isBuffer()) {
                    const list = await that.iterateCache(file.path, async ref => await that.resolveBufferRef(ref));
                    if (!that.options.disableLog)
                        logInfo(list.length);

                    if (that.options.dependencyOutput !== "primary")
                        list.forEach(ref => this.push(ref));

                    if (that.options.dependencyOutput !== "dependant")
                        this.push(file);
                }
                else if (file.isStream()) {
                    const list = await that.iterateCache(file.path, async ref => that.resolveStreamRef(ref));
                    if (!that.options.disableLog)
                        logInfo(list.length);

                    list.forEach(ref => this.push(ref));
                    this.push(file);
                }
                cb();
            }
            catch (err: any) {
                log.error(err.message);
                cb(new PluginError(PLUGIN_NAME, err));
            }
        });
    }

    /**
     * Iterates throught and modifies dependant files.
     * @param path The path to the primary file.
     * @param predicate The action to resolve a dependant file.
     * @returns The promise that represents the asynchronous operation, containing the resolved files.
     */
    private async iterateCache(path: string, predicate: (value: File) => Promise<File>): Promise<File[]> {
        let fileList: File[] = [];
        const encoded = Importer.encode(Path.resolve(path));

        if (this._cache.hasOwnProperty(encoded)) {
            for (let [_, file] of Object.entries(this._cache[encoded])) {
                const refFile = await predicate(file);
                fileList.push(refFile);
            }
        }
        return fileList;
    }

    /**
     * Resolves buffers for the specified file.
     * @param file The file to resolve buffers for.
     * @returns The promise that represents the asynchronous operation, containing the resolved file.
     */
    private async resolveBufferRef(file: File): Promise<File> {
        try{
            let refFile = new File({
                cwd: file.cwd,
                base: file.base,
                path: file.path,
                contents: await afs.readFile(file.path)
            });

            refFile.contents = await this.resolveBuffer(refFile);
            return refFile;
        } catch (error: any) {
            throw new PluginError(PLUGIN_NAME, error);
        }
    }

    /**
     * Resolves streaming content for the specified file.
     * @param file The file whose streaming contents should be resolved.
     * @returns The promise that represents the asynchronous operation, containing the resolved file.
     */
    private resolveStreamRef(file: File): File {
        const rStream = fs.createReadStream(file.path, { encoding: this.options.encoding });
        const tStream = this.resolveStream(file);

        return new File({
            cwd: file.cwd,
            base: file.base,
            path: file.path,
            contents: rStream.pipe(tStream)
        });
    }

    /**
     * Validates an input file.
     * @param stream The pipe stream.
     * @param file The input file.
     * @param cb The transform callback.
     * @returns The flag indicating whether the input file is valid.
     */
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

    /**
     * Appends the speicifed dependancy path to primary relative cache to be triggered on modify.
     * @param dpnPath The dependant file to be added to the update cache.
     * @param prmPath The primary file that triggers the update.
     */
    private appendCache(dpnPath: string, prmPath: any): void {
        dpnPath = Importer.encode(dpnPath);
        const file = new File({
            cwd: prmPath.cwd,
            base: prmPath.base,
            path: Path.resolve(prmPath.path)
        });

        const path = Importer.encode(file.path);

        if (!this._cache[dpnPath])
            this._cache[dpnPath] = { [path]: file };
        else
        if (!this._cache[dpnPath].hasOwnProperty(path)) {
            this._cache[dpnPath][path] = file;
        }
    }

    /**
     * Returns the base64 encoded version of the specified value.
     * @param value The value to be encoded.
     * @returns The incoded version of the input value.
     */
    private static encode(value: string): string {
        return Buffer.from(value).toString('base64');
    }

    /**
     * Resolves the buffers for the specified file.
     * @param file The file whose buffer should be resolved.
     * @returns The resolved buffers.
     */
    private async resolveBuffer(file: any): Promise<Buffer> {
        let content = file.contents.toString(this.options.encoding);
        content = await this.replace(file, content);

        return Buffer.from(content, this.options.encoding);
    }

    /**
     * Resolves the streaming content for the specified file.
     * @param file The file whose streaming content should be resolved.
     * @returns The transformed stream for the specified file.
     */
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

    /**
     * Applies imports on the specified content.
     * @param file The file apply imports for.
     * @param content The content to apply imports on.
     * @param resolveStack The resolve stack to cache the resolved imports.
     * @returns The resolved version of the specified content.
     */
    private async replace(file: any, content: string, resolveStack: string[] = []): Promise<string> {
        for (const match of content.matchAll(this.options.regexPattern!)) {
            const value = match[0];
            const dPath = Path.resolve(Path.parse(file.path).dir, match[1].trim()); // Dependancy path.

            // Ignore repeated imports..
            if (this.options.importOnce) {
                if (resolveStack.includes(dPath)) {
                    content = content.replace(value, "");

                    if (!this.options.disableLog)
                        log.warn(`Repeated import "${dPath}" in "${file.path}"`);

                    continue;
                }
                else resolveStack.push(dPath);
            }

            const dependency = await this.readFile(dPath);
            content = content.replace(value, dependency.replace(/\$/g, "$$$$"));

            this.appendCache(dPath, file);
        }

        if (this.options.detailedLog)
            log.info("Resolved imports for: " + file.path);

        return content;
    }

    /**
     * Reads the content of the file at the specified path.
     * @param path The path of the desired file.
     * @returns The promise that represents the asynchronous operation, containing the content of the file, if exists.
     */
    private async readFile(path: string): Promise<string> {
        try {
            const content = await afs.readFile(path, { encoding: this.options.encoding });
            if (content instanceof Buffer)
                return content.toString();
            else
                return content;
        }
        catch (error: any) {
            throw new PluginError(PLUGIN_NAME, `The path "${path}" doesn't exist!`);
        }
    };
}

export default Importer;