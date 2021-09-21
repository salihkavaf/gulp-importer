import Importer from './../lib/index'
import assert   from 'assert'
import File     from 'vinyl'
import fs       from 'fs'
import es       from 'event-stream'
import Path     from 'path'

const libFile  = "test/res/lib.txt";
const testFile = "test/res/src.txt";

const expected = "This is the lib file!\r\nThis is the source file!";

describe("gulp-importer", () => {

    const importer = new Importer({
        encoding: "utf-8"
    });

    it("should work in stream mode", done => {
        const stream = fs.createReadStream(testFile, {
            encoding: "utf-8"
        });

        const file = new File({
            contents: stream,
            path: stream.path as string
        });

        const imp = importer.import();

        imp.write(file);
        imp.once("data", file => {
            assert(file.isStream(), "The output is not stream!");

            file.contents.pipe(es.wait(function (err: any, data: any) {
                assert.equal(data.toString(), expected, "Unexprected stream output!");
                done();
            }));
        });
    });

    it("should work in buffer mode", done => {
        const buff = fs.readFileSync(testFile);
        const file = new File({
            contents: buff,
            path: testFile
        });

        const imp = importer.import();

        imp.write(file);
        imp.once("data", file => {
            assert(file.isBuffer(), "The output is not buffer!");

            assert(file.contents.toString("utf-8"), expected);
            done();
        });
    });

    it("importOnce option should work", done => {
        const content = '@import "./lib.txt"\r\n' +
            '@import "./lib.txt"\r\n' +
            'This is dump file';

        const file = new File({
            contents: Buffer.from(content, "utf-8"),
            path: testFile
        });

        const imp = importer.import();

        imp.write(file);
        imp.once("data", file => {
            const result: string = file.contents.toString("utf-8");
            var matches = result.match(/This is the lib file!/g) || [];
            
            assert.equal(matches.length, 1, "Not ignoring repeated imports!");
            done();
        });
    });

    it("should cache dependency destinations", done => {
        const path   = Path.resolve(libFile);
        const base64 = Buffer.from(path).toString("base64");

        assert(importer.cache.hasOwnProperty(base64), "Not resolving cache!");
        done();
    });

    it("Importer.watch should update stream dependency", done => {
        const stream = fs.createReadStream(libFile, {
            encoding: "utf-8"
        });

        const file = new File({
            contents: stream,
            path: stream.path as string
        });

        const imp = importer.watch();

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

    it("Importer.watch should update buffer dependency", done => {
        const buff = fs.readFileSync(testFile);
        const file = new File({
            contents: buff,
            path: testFile
        });

        const imp = importer.watch();

        let length = 0;

        imp.write(file);
        imp.on("data", file => {
            assert(file.isBuffer(), "The output is not buffer!");
            length++;

            if (length == 2)
                done();
        });
    });
});