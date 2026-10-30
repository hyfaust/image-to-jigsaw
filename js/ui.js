/**
 * 顶栏那几个小控件：计时、进度、原图预览开关、拼图选择器。
 */

export function createStats(timerEl, progressEl) {
  let startedAt = 0;
  let ticker = null;
  let done = 0;
  let total = 0;

  const renderProgress = () => {
    progressEl.textContent = `${done} / ${total}`;
  };

  const renderTime = () => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    timerEl.textContent = `${mm}:${ss}`;
  };

  return {
    /** 开新一局。initialDone 用于被锁定的高亮块（一开始就已经就位）。 */
    begin(count, initialDone = 0) {
      total = count;
      done = initialDone;
      startedAt = Date.now();
      renderProgress();
      renderTime();
      if (ticker) clearInterval(ticker);
      ticker = setInterval(renderTime, 500);
    },
    stop() {
      if (ticker) clearInterval(ticker);
      ticker = null;
    },
    /** 放好一块，返回是否已经全部完成。 */
    placed() {
      done += 1;
      renderProgress();
      return done >= total;
    },
  };
}

export function setPreview(button, board, visible) {
  board.classList.toggle('board--preview', visible);
  button.dataset.visible = String(visible);
  button.setAttribute('aria-pressed', String(visible));
  button.textContent = `Preview: ${visible ? 'On' : 'Off'}`;
}

/** 只有多张拼图时才渲染选择器，单张时整条都空着。 */
export function renderPicker(container, puzzles, activeIndex, onSelect) {
  container.replaceChildren();
  if (puzzles.length < 2) return;

  puzzles.forEach((puzzle, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `picker__item${index === activeIndex ? ' is-active' : ''}`;
    button.style.backgroundImage = `url("${puzzle.image}")`;
    button.title = puzzle.image;
    button.addEventListener('click', () => onSelect(index));
    container.append(button);
  });
}

/**
 * 下载按钮：拼完之前保持禁用。
 * 下载直接指向原始图片 URL，拿到的就是服务器上那个文件本身，
 * 而不是把棋盘（带网格、带缝隙）重新画一遍再导出。
 */
export function createDownloadButton(button, getSource) {
  const setReady = (ready) => {
    button.disabled = !ready;
    button.title = ready ? 'Download the original image' : 'Solve the puzzle first';
  };
  setReady(false);

  button.addEventListener('click', () => {
    const source = getSource();
    const link = document.createElement('a');
    link.href = source;
    link.download = source.split('/').pop();
    document.body.append(link);
    link.click();
    link.remove();
  });

  return { setReady };
}