// PDFs from Moodle, shown with Chromium's built-in viewer (zoom, search, print). The main process fetches
// the file to a temporary folder; Download still saves it to the download folder like anywhere else.

Views.pdf = {
  nav: 'courses',
  title: (p) => p.file?.filename || 'PDF',

  async render(root, { file, folder = [] }, ctx) {
    const head = `
      <div class="page-head">
        <div>
          <div class="page-head__eyebrow">${esc([...folder.slice(0, 2), fmtSize(file.filesize)].filter(Boolean).join(' · '))}</div>
          <h1>${esc(file.filename)}</h1>
        </div>
        <div class="toolbar">
          <button class="btn btn--primary" id="pdfDownload">${Icons.download} Download</button>
        </div>
      </div>`;
    const show = (body) => {
      root.innerHTML = head + body;
      $('#pdfDownload', root).addEventListener('click', () => App.downloadFile(file, folder));
    };
    show(loadingHTML());
    let url;
    try {
      url = await neko.previewFile({ url: file.fileurl, filename: file.filename, filesize: file.filesize, mimetype: file.mimetype });
    } catch (e) {
      if (!ctx.isCurrent() || App.handleAuthError(e)) return;
      return show(errorHTML(e));
    }
    if (!ctx.isCurrent()) return;
    show(`<iframe class="pdf-frame" id="pdfFrame" title="${esc(file.filename)}" src="${esc(url)}"></iframe>`);
  },
};
