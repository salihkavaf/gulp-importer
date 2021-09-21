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
Here you execute the imports in your files. *gulp-importer* supports both buffering and streaming with custom encoding. See [Options](https://github.com/salihkavaf/gulp-importer/blob/main/README.md#options) for detailed configuration.

It's recommended that you also use a caching plugin like [gulp-cached](https://www.npmjs.com/package/gulp-cached) alongside *gulp-importer* to avoid unnecessarily repeat import execution.
```js
const gulp     = require('gulp');
const cache    = require("gulp-cached");
const Importer = require('gulp-importer').default;

const importer = new Importer({
    encoding: "utf-8", // Check the available encodings in the options
    dependencyOutput: "dependant"
});

gulp.task('import', () => {
    return gulp.src('index.js')
    
        // Adding a caching step to the chain will prevent
        // unnecessary import executions.
        .pipe(cache("imports", {
            optimizeMemory: true
        }))
        .pipe(importer.execute()) // <-- Execute imports here
        .pipe(gulp.dest('./dist'));
});
```

### Updating Dependency
Automatically execute imports for specific files when dependencies change. This saves you a lot of time from going through each file after a simple dependency change. So, we'll watch the resources that's supposed to be cached in the import step above. Why cached? Well, it's much faster to run the imports once and cache a dependency tree rather than looking up through a whole file tree, right?!

```js
gulp.task('import', () => {
    return gulp.src('some-lib.js')
    
        // Again, it's useful to use caching to avoid
        // watching unchanged resources.
        .pipe(cache("imports", {
            optimizeMemory: true
        }))
        .pipe(importer.updateDependency()) // <-- Update dependency here
        .pipe(gulp.dest('./dist'));
});

gulp.task("watch", () => {
    gulp.watch("./lib/**/*.js", gulp.series("update"));
});
```
> **Note:** Dependency update doesn't apply any imports on the primary file. It will go out the same as it was, coming in.

## Options
| Name | Type | Default | Info |
|---|---|---|---|
| regexPattern | RegExp | /@{0,1}import\s+["']\s\*(.\*)\s\*["'];{0,1}/gi | The regular expression pattern is used to place the import statements. Note that the "(.\*)" part of the pattern is required, being pointing to the path.<br>For example, the regex for (hello <./path/here>) is (/hello\s+<(.\*)>/gi). |
| encoding | ascii, utf8, utf-8, utf16le, ucs2, base64, base64url, latin1, binary, hex | utf-8 | The encoding to be used for buffering and streaming. |
| ignoreRepeated | boolean | true | The flag that indicates whether to ingore repeated import statements. In other words, a file can only be imported once |
| dependencyOutput | primary, all, dependant | primary | **1. primary:** Only the primary file will be piped out.<br>**2. dependant:** Only dependant files will be piped out.<br>**3. all:** The primary file and the dependant files will all be piped out.<br>This option only applies in buffer mode, wherein stream mode, dependant files are always piped out. |

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License
[MIT](https://choosealicense.com/licenses/mit/)
