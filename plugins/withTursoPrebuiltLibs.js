/**
 * @tursodatabase/sync-react-native@0.8.x ships prebuilt .so files in libs/android,
 * but its android/build.gradle unconditionally runs `make android` (a source-build
 * step whose Makefile isn't even in the npm package). Disable that task so Gradle
 * just uses the prebuilt libraries.
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = '// syncnote: use prebuilt turso libs';

module.exports = function withTursoPrebuiltLibs(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `
${MARKER}
gradle.afterProject { p ->
  if (p.name == 'tursodatabase_sync-react-native') {
    p.tasks.matching { it.name == 'buildRustLibrary' }.configureEach { enabled = false }
  }
}
`;
    }
    return cfg;
  });
};
