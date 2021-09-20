# gulp-importer
A simple gulp plugin that allows importing any kind of file to any kind of file. Nevertheless, *gulp-importer* looks up to the **importing** files and automatically updates dependency. So, when developing lib files other such, you don't have to go through every file that imports that lib and recompile it; instead, just let *gulp-importer* take care of it for you.

> **Note:** This plugin is still in beta version. So, if you experience any issues or come across some bugs, or even have a feature suggestion, feel free to open an issue or contribute if you'd like to.

## Installation
To install the plugin, run the following command in your terminal:
```
npm install gulp-importer --save-dev
```

## Usage
### Execute Imports
Here you execute the imports in your files. *gulp-importer* supports both buffering and streaming with custom encoding. See [Options](https://github.com/salihkavaf/gulp-importer/blob/main/README.md#options) for more configurations.

It's recommended that you also use a caching plugin like [gulp-cached](https://www.npmjs.com/package/gulp-cached) alongside *gulp-importer* to avoid unnecessarily repeat import execution.
```js
const gulp     = require('gulp');
const cache    = require("gulp-cached");
const Importer = require('gulp-importer');

const importer = new Importer({
    encoding: "utf-8"
});

gulp.task('import', () => {
  return gulp.src('index.js')
        .pipe(cache("imports", {
            optimizeMemory: true
        }))
        .pipe(importer.import())
        .pipe(gulp.dest('dist'));
});
```

### Watching Dependency
> ### Comming soon!
Automatically execute imports for specific files when dependencies change. This saves you a lot of time from going through each file after a simple dependency change.

## Options
| Name           | Type                                                                      | Default | Info                                                                                                                   |
|----------------|---------------------------------------------------------------------------|---------|------------------------------------------------------------------------------------------------------------------------|
| encoding       | ascii, utf8, utf-8, utf16le, ucs2, base64, base64url, latin1, binary, hex | utf-8   | The encoding to be used for buffering and streaming.                                                                   |
| importOnce     | boolean                                                                   | true    | The flag that indicates whether to ingore repeated import statements. In other words, a file can only be imported once |

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License
[MIT](https://choosealicense.com/licenses/mit/)
