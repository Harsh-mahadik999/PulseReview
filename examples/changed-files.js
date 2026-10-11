// Standalone example for summarizing changed file paths in a PR.
// Preserve the first-seen order and leave the input array unchanged.
function uniqueChangedFiles(paths) {
  return paths.filter((path, index) => paths.indexOf(path) === index)
}

module.exports = { uniqueChangedFiles }
