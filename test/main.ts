import Importer from './../lib/index'
import assert   from 'assert'
import File     from 'vinyl'
import fs       from 'fs'
import es       from 'event-stream'
import Path     from 'path'
import through  from 'through2';
import { Transform } from 'stream'

const libFile  = "test/res/lib.txt";
const testFile = "test/res/src.txt";
const expected = "This is the lib file!\r\nThis is the source file!";

const recTestFile = "test/res/recursive_src.txt";
const recExpected = "This is the lib file!\r\nThis is the a dependant lib file!\r\nThis is the source file!";

const noExtFile = "test/res/no_ext_src.txt";

describe("gulp-importer", () => {

    const importer = new Importer({
        encoding: "utf-8",
        disableLog: true,
        dependencyOutput: "all",
        importRecursively: true,
        requireExtension: false
    });

    function resolveStream(filename: string, expected: string, done: Mocha.Done) {
        const stream = fs.createReadStream(filename, {
            encoding: "utf-8"
        });

        const file = new File({
            contents: stream,
            path: stream.path as string
        });

        const imp = importer.execute();

        imp.write(file);
        imp.once("data", file => {
            assert(file.isStream(), "The output is not stream!");

            file.contents.pipe(es.wait(function (err: any, data: any) {
                assert.equal(data.toString(), expected, "Unexpected stream output!");
                done();
            }));
        });
    }

    function resolveBuffer(filename: string, expected: string, done: Mocha.Done) {
        const buff = fs.readFileSync(filename);
        const file = new File({
            contents: buff,
            path: filename
        });

        const imp = importer.execute();

        imp.write(file);
        imp.once("data", file => {
            assert(file.isBuffer(), "The output is not buffer!");

            assert.equal(file.contents.toString("utf-8"), expected, "Unexpected buffer output!");
            done();
        });
    }

    it("Should work in stream mode", done => resolveStream(testFile, expected, done));
    it("Should work in buffer mode", done => resolveBuffer(testFile, expected, done));

    it("importOnce option should work", done => {
        const content = '@import "./lib.txt"\r\n' +
            '@import "./lib.txt"\r\n' +
            'This is dump file';

        const file = new File({
            contents: Buffer.from(content, "utf-8"),
            path: testFile
        });

        const imp = importer.execute();

        imp.write(file);
        imp.once("data", file => {
            const result: string = file.contents.toString("utf-8");
            var matches = result.match(/This is the lib file!/g) || [];
            
            assert.equal(matches.length, 1, "Not ignoring repeated imports!");
            done();
        });
    });

    it("Should cache dependency destinations", done => {
        const path   = Path.resolve(libFile);
        const base64 = Buffer.from(path).toString("base64");

        assert(importer.cache.hasOwnProperty(base64), "Not resolving cache!");
        done();
    });

    it("Should update dependency in stream mode", done => {
        const stream = fs.createReadStream(libFile, {
            encoding: "utf-8"
        });

        const file = new File({
            contents: stream,
            path: stream.path as string
        });

        const imp = importer.updateDependency();

        let length = 0;

        imp.write(file);
        imp.on("data", file => {
            assert(file.isStream(), "The output is not stream!");

            file.contents.pipe(es.wait(function (err: any, data: any) {
                length++;

                if (length == 2)
                    done();
            }));
        });
    });

    it("Should update dependency in buffer mode", done => {
        const buff = fs.readFileSync(libFile);
        const file = new File({
            contents: buff,
            path: libFile
        });

        const imp = importer.updateDependency();

        let length = 0;

        imp.write(file);
        imp.on("data", file => {
            assert(file.isBuffer(), "The output is not buffer!");
            length++;

            if (length == 2)
                done();
        });
    });

    it("Should recursively update dependency in stream mode", done => resolveStream(recTestFile, recExpected, done));
    it("Should recursively update dependency in buffer mode", done => resolveBuffer(recTestFile, recExpected, done));

    it("Should work without file extension", done => resolveStream(noExtFile, recExpected, done));

    function dependencyTransformer(src: NodeJS.ReadWriteStream) {
        return src.pipe(through.obj(function (file: File, _, cb) {
            try {
                if (!file.isNull()) {
                    const content = (file.contents as Buffer).toString().toUpperCase();
                    this.push(Buffer.from(content));
                }
                cb();
            } catch (error) {
                cb(error);
            }
        }));
    }

    it("Should transform dependency in stream mode", done => {
        const stream = fs.createReadStream(testFile, {
            encoding: "utf-8"
        });

        const file = new File({
            contents: stream,
            path: stream.path as string
        });

        const imp = importer.execute(dependencyTransformer);

        imp.write(file);
        imp.once("data", file => {
            assert(file.isStream(), "The output is not stream!");

            file.contents.pipe(es.wait(function (err: any, data: any) {
                const result = data.toString().split('\r\n')[0];
                const expctd = expected.split('\r\n')[0].toUpperCase();

                assert.equal(result, expctd, "Unexpected stream output!");
                done();
            }));
        });
    });

    it("Should transform dependency in buffer mode", done => {
        const buff = fs.readFileSync(testFile);
        const file = new File({
            contents: buff,
            path: testFile
        });

        const imp = importer.execute(dependencyTransformer);

        imp.write(file);
        imp.once("data", file => {
            assert(file.isBuffer(), "The output is not buffer!");

            const result = file.contents.toString('utf-8').split('\r\n')[0];
            const expctd = expected.split('\r\n')[0].toUpperCase();

            assert.equal(result, expctd, "Unexpected stream output!");
            done();
        });
    });
});