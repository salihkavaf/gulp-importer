import Importer from './../lib/index'
import assert   from 'assert'
import File     from 'vinyl'
import fs       from 'fs'
import es       from 'event-stream'

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
            assert(file.isBuffer(), "The outpout is not buffer!");

            assert(file.contents.toString("utf-8"), expected);
            done();
        });
    });

    it("should ignore repeated imports", done => {
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
});