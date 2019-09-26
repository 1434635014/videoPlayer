'use strict';

const del = require('del');
const gulp = require('gulp');
const babelify = require('babelify');
const browserify = require('browserify');
const watchify = require('watchify');
const tsify = require('tsify');
const uglify = require('gulp-uglify');
const obfuscator = require('gulp-javascript-obfuscator');
const sourcemaps = require('gulp-sourcemaps');
const buffer = require('vinyl-buffer');
const source = require('vinyl-source-stream');

const browserSync = require('browser-sync').create();

const dest = 'build';

gulp.task('clean', () => { return del(dest + '/*'); });

gulp.task('clean-release', () => {
    return del([
        dest + '/**/*.map',
        dest + '/example/example.html',
        dest + '/example/server.bat',
        dest + '/example/server.js'
    ])
});

gulp.task('copy-README', () => { return gulp.src(['README.md']).pipe(gulp.dest(dest)); });
gulp.task('copy-example', () => { return gulp.src(['example/**/*.*']).pipe(gulp.dest(dest + '/example/')); });
gulp.task('copy-d-ts', () => { return gulp.src(['d.ts/**/*.d.ts']).pipe(gulp.dest(dest + '/d.ts/')); });
gulp.task('copy-docs', () => { return gulp.src(['docs/api.md']).pipe(gulp.dest(dest + '/docs/')); });
gulp.task('copy-files', gulp.parallel('copy-README', 'copy-example', 'copy-d-ts', 'copy-docs'));

function doWatchify() {
    const customOpts = {
        entries: ['src/player.ts'],
        basedir: '.',
        debug: true,
        cache: {},
        packageCache: {}
    };
    const opts = Object.assign({}, watchify.args, customOpts);
    const bo = browserify(opts).require('./src/player.ts', { expose: 'YDPlayer' });

    const w = watchify(bo, {
        delay: 1000,
        ignoreWatch: ['**/node_modules/**'],
        poll: false
    });

    w.on('update', function () {
        return doDefaultBundle(w).on('end', browserSync.reload.bind(browserSync));
    });
    w.on('log', console.log.bind(console));

    return w;
}

function doBrowserify(entries) {
    return browserify({
        basedir: '.',
        debug: true,
        entries: entries,
        cache: {},
        packageCache: {}
    });
}

function doBundle(bo, file) {
    return bo.plugin(tsify)
        .transform('babelify', { presets: ['es2015'] })
        .transform('browserify-css', { autoInject: true })
        .bundle()
        .on('error', console.error.bind(console))
        .pipe(source(file))
        .pipe(buffer())
        .pipe(sourcemaps.init({ loadMaps: true }))
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest(dest + '/dist/'));
}

function doDefaultBundle(bo) {
    return doBundle(bo, 'ydplayer.js');
}

gulp.task('bundle-player', function () {
    const bo = doBrowserify(['src/player.ts'])
        .require('./src/player.ts', { expose: 'YDPlayer' });
    return doBundle(bo, 'ydplayer.js');
});

gulp.task('bundle-plugin', function () {
    const bo = doBrowserify(['src/compatible/player-plugin.ts'])
        .require('./src/player.ts', { expose: 'YDPlayer' })
        .require('./src/compatible/player-plugin.ts', { expose: 'YDPlayerPlugIn' });
    return doBundle(bo, 'ydplayer-plugin.js');
});

gulp.task('bundle-plugin-run', function () {
    const bo = doBrowserify(['src/compatible/player-plugin-run.ts'])
        .require('./src/player.ts', { expose: 'YDPlayer' })
        .require('./src/compatible/player-plugin.ts', { expose: 'YDPlayerPlugIn' });
    return doBundle(bo, 'ydplayer-plugin-run.js');
});

gulp.task('bundles', gulp.parallel('bundle-player', 'bundle-plugin', 'bundle-plugin-run'));

gulp.task('build', gulp.parallel('copy-files', 'bundles'));

function doMinimize(src) {
    let options = {
        sourceMap: false,
        //sourceMapIncludeSources: true,
        //sourceMapRoot: './src/',
        mangle: true,
        compress: {
            sequences: true,
            dead_code: true,
            conditionals: true,
            booleans: true,
            unused: true,
            if_return: true,
            join_vars: true
        }
    };

    return gulp.src(src)
        //.pipe(rename({ extname: '.min.js' }))
        .pipe(sourcemaps.init({ loadMaps: true }))
        .pipe(uglify(options))
        .on('error', console.error.bind(console))
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest(dest + '/dist/'));
}

gulp.task('minimize-player', function () { return doMinimize(dest + '/dist/ydplayer.js'); });
gulp.task('minimize-plugin', function () { return doMinimize(dest + '/dist/ydplayer-plugin.js'); });
gulp.task('minimize-plugin-run', function () { return doMinimize(dest + '/dist/ydplayer-plugin-run.js'); });

gulp.task('minimize', gulp.parallel('minimize-player', 'minimize-plugin', 'minimize-plugin-run'));

gulp.task('default', gulp.series('clean', 'build'));
gulp.task('release', gulp.series('clean', 'build', 'minimize', 'clean-release'));

gulp.task('watch', gulp.series('clean', 'build', function () {
    const gulpWatcher = gulp.watch(['gulpfile.js', 'src/**/*.ts', 'src/**/*.js', 'src/**/*.html']);

    gulpWatcher.on('change', function (e) {
        if (e.type === 'changed' || e.type === 'added') {
            //return doLint(e.path, false);
        }
    });

    return doDefaultBundle(doWatchify()).on('end', function () {
        browserSync.init({
            server: {
                baseDir: './build'
            },
            port: 8880,
            open: false
        });
        require('opn')('http://localhost:8880/example/index.html');
    });
}));
