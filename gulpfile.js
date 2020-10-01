const gulp = require('gulp');
const ts = require('gulp-typescript');
const nodemon = require('gulp-nodemon');

const tsProject = ts.createProject('tsconfig.json');

function build(cb) {
  tsProject.src()
    .pipe(tsProject())
    .js.pipe(gulp.dest('dist'));
  cb();
}
function assets(cb) {
  gulp.src('src/assets/*')
    .pipe(gulp.dest('dist/assets'));
  cb();
}

function run() {
  return nodemon({
    script: 'dist/index.js',
    watch: ['dist/'],
    delay: '1000',
  });
}
gulp.watch('src/*', gulp.parallel(build, assets));
exports.default = gulp.series(gulp.parallel(build, assets), run);
