/**
 * NB: All tasks are initialized lazily, even plugins are required lazily,
 * running 1 task does not require all tasks' files
 */

// new Set([1,2]).size = 0 in node 0.11.14, Set is buggy all around
// this header prevents `array-uniq` (-> array-union -> multimatch -> gulp-load-plugins) from it's use
// fixme: when those above are fixed, remove it
delete Set.prototype.forEach;

const gulp = require('gulp');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const runSequence = require('run-sequence');

// before anything: make sure all modules are linked
gulp.task('link-modules', lazyRequireTask('./tasks/linkModules', { src: ['client', 'modules/*', 'hmvc/*'] }));
// sync!
gulp.start('link-modules');

const config = require('config');
const mongoose = require('config/mongoose');

//Error.stackTraceLimit = Infinity;
//require('trace');
//require('clarify');

process.on('uncaughtException', function(err) {
  console.log(err.message, err.stack);
  process.exit(255);
});

const jsSources = [
  'hmvc/**/*.js', 'modules/**/*.js', 'tasks/**/*.js', '*.js'
];

function lazyRequireTask(path) {
  var args = [].slice.call(arguments, 1);
  return function(callback) {
    var task = require(path).apply(this, args);
    return task(callback);
  };
}


gulp.task('lint-once', lazyRequireTask('./tasks/lint', { src: jsSources }));
gulp.task('lint-or-die', lazyRequireTask('./tasks/lint', { src: jsSources, dieOnError: true }));

// usage: gulp loaddb --db fixture/db
gulp.task('loaddb', lazyRequireTask('./tasks/loadDb'));

gulp.task("nodemon", lazyRequireTask('./tasks/nodemon', {
  ext:    "js,jade",
 // restartable: false, // don't hook on STDIN to wait rs
  nodeArgs: ['--debug', '--harmony'],
  script: "./bin/server",
  ignore: '**/client/', // ignore hmvc apps client code
  watch:  ["hmvc", "modules"]
}));

gulp.task("client:livereload", lazyRequireTask("./tasks/livereload", {
  // watch files *.*, not directories, no need to reload for new/removed files,
  // we're only interested in changes
  watch: "public/{i,img,js,styles}/**/*.*"
}));

gulp.task('watch', lazyRequireTask('./tasks/watch', {
  root:        __dirname,
  taskMapping: [
    {
      watch: 'assets/**',
      task:  'client:sync-resources'
    },
    {
      watch: 'styles/**/*.{png,svg,gif,jpg}',
      task:  'client:sync-css-images'
    },
    {
      watch: "styles/**/*.styl",
      task:  'client:compile-css'
    },
    {
      watch: ['client/**', 'hmvc/**/client/**'],
      ignore: 'client/versions.json',
      task:  "client:browserify"
    },
    {
      watch: 'public/{fonts,js,styles}/**',
      task:  'client:build-public-versions'
    }
  ]
}));

gulp.task("client:sync-resources", lazyRequireTask('./tasks/syncResources', {
  assets: 'public'
}));


gulp.task("client:sync-css-images", lazyRequireTask('./tasks/syncCssImages', {
  src: 'styles/**/*.{png,svg,gif,jpg}',
  dst: 'public/i'
}));

gulp.task('client:clean-compiled-css', function(callback) {
  fs.unlink('./public/styles/base.css', function(err) {
    if (err && err.code == 'ENOENT') return callback();
    callback(err);
  });
});

// Show errors if encountered
gulp.task('client:compile-css',
  ['client:clean-compiled-css'],
  lazyRequireTask('./tasks/compileCss', {
    src: './styles/base.styl',
    dst: './public/styles',
    publicDst: config.staticHost + '/styles/',  // from browser point of view
    manifest: path.join(config.tmpRoot, 'styles.versions.json')
  })
);

gulp.task('client:minify', lazyRequireTask('./tasks/minify', {
  root: './public'
}));

gulp.task("client:browserify:clean", lazyRequireTask('./tasks/browserifyClean', {
  dst: './public/js'
}));

gulp.task("client:browserify", ['client:browserify:clean'], lazyRequireTask('./tasks/browserify'));

// we depend on compile-css, because if build-md5-list works in parallel with client:compile-css,
// then compile-css recreates files and build-md5-list misses them or errors when they are suddenly removed
gulp.task("client:build-public-versions",
  lazyRequireTask('./tasks/buildPublicVersions', { cwd: 'public', src: './{fonts,js,styles}/**/*.*', dst: './public.versions.json' }));

gulp.task('build', function(callback) {
  runSequence("client:sync-resources", 'client:compile-css', 'client:browserify', 'client:sync-css-images', 'client:build-public-versions', callback);
});

gulp.task('dev', function(callback) {
  runSequence('build', ['nodemon', 'client:livereload', 'watch'], callback);
});

gulp.task('tutorial:import', ['cache:clean'], lazyRequireTask('tutorial/tasks/import', {
  root:        'javascript-tutorial',
  updateFiles: true // skip same size files
}));

gulp.task('cache:clean', lazyRequireTask('./tasks/cacheClean'));

gulp.task('check:spider', lazyRequireTask('./tasks/checkSpider'));

// when queue finished successfully or aborted, close db
// orchestrator events (sic!)
gulp.on('stop', function() {
  mongoose.disconnect();
});

gulp.on('err', function() {
  mongoose.disconnect();
});


