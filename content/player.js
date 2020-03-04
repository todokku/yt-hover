/*
global config
global hover
global player
global onOff
global sendCmd
*/
'use strict';

(() => {
  const ASPECT_RATIO = 16 / 9;
  const MIN_WIDTH = 200;
  const BORDER_WIDTH = '4px';
  const STYLES = {
    main: /*language=CSS*/ cssImportant(`
      :host {
        all: initial;
        border: ${BORDER_WIDTH} solid #3338;
        box-sizing: content-box;
        box-shadow: 0 0 30px #000;
        background: transparent center center no-repeat;
        background-image: url("${chrome.runtime.getURL('ui/img/loader.gif')}");
        z-index: 2147483647;
        cursor: move;
        opacity: 0;
        transition: opacity .25s;
      }
    `) + `
      iframe {
        width: 100%;
        height: 100%;
        border: none;
        overflow: hidden;
        background: none;
        position: relative;
      }
      #resizers {
        position: absolute;
        pointer-events: none;
        top: -${BORDER_WIDTH};
        left: -${BORDER_WIDTH};
        right: -${BORDER_WIDTH};
        bottom: -${BORDER_WIDTH};
      }
      #resizers.moving {
        pointer-events: auto;
      }
      #resizers * {
        position: absolute;
        pointer-events: auto;
        width: ${BORDER_WIDTH};
        height: ${BORDER_WIDTH};
      }
      .top.left  {
        cursor: nw-resize;
      }
      .top.right  {
        right: 0;
        cursor: ne-resize;
      }
      .bottom.right {
        right: 0;
        bottom: 0;
        cursor: se-resize;
      }
      .bottom.left  {
        bottom: 0;
        cursor: sw-resize;
      }
    `,
    cursor: ':host { cursor: % !important }',
    dark: /*language=CSS*/ cssImportant(`
      :host {
        box-shadow: 0 0 0 90000px #000;
        border-color: transparent;
      }
    `),
    error: /*language=CSS*/ cssImportant(`
      :host {
        background-image: url("${chrome.runtime.getURL('ui/img/error.svg')}");
        background-size: 128px;
      }
    `),
    fadein: /*language=CSS*/ cssImportant(`
      :host {
        opacity: 1;
      }
    `),
    loaded: /*language=CSS*/ cssImportant(`
      :host {
        background-image: none;
      }
    `),
    fence: /*language=CSS*/ cssImportant(`
      :host {
        all: initial;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 2147483646;
        user-select: none;
        -moz-user-select: none;
        /*cursor*/;
      }
    `),
  };

  let dom = {
    /** @type HTMLElement */
    player: null,
    /** @type HTMLElement */
    resizers: null,
    /** @type HTMLStyleElement */
    style: null,
  };

  const shifter = {
    SUPPRESSED_EVENTS: [
      'mouseenter',
      'mouseleave',
      'mouseover',
    ],
    /** @param {MouseEvent} e */
    onMouseDown(e) {
      shifter.consume(e);
      const data = (e || shifter).target === dom.player ? shifter.move : shifter.resize;
      const method = onOff(e);
      document[method]('mousemove', data.handler);
      document[method]('mouseup', shifter.onMouseUp);
      document[method]('selectionchange', shifter.onSelection);
      for (const type of shifter.SUPPRESSED_EVENTS)
        window[method](type, shifter.consume, true);
      dom.resizers.classList.toggle('moving', !!e);
      if (e) {
        data.x0 = data.x;
        data.y0 = data.y;
        data.clientX = e.clientX;
        data.clientY = e.clientY;
        shifter.data = data;
        shifter.target = this;
        const cursor = STYLES.cursor.replace('%', data.cursor);
        shifter.cursorStyle = cssAppend(cursor);
        shifter.fence = document.body.appendChild($div()).attachShadow({mode: 'closed'});
        shifter.fence.appendChild($create('style', STYLES.fence + cursor));
      }
    },
    /** @param {MouseEvent} e */
    onMouseUp(e) {
      shifter.consume(e);
      shifter.onMouseDown(false);
      shifter.target = null;
      window.addEventListener('click', shifter.consumeClick, true);
    },
    onSelection() {
      const sel = getSelection();
      if (!sel.empty()) sel.removeAllRanges();
    },
    consume(e) {
      if (e instanceof Event) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    },
    consumeClick(e) {
      shifter.consume(e);
      shifter.fence.host.remove();
      dom.style.sheet.deleteRule(shifter.cursorStyle._ruleIndex);
      window.removeEventListener('click', shifter.consumeClick, true);
    },
    stop: () => {
      shifter.data.handler(shifter.data);
      shifter.onMouseUp();
    },
    move: {
      x: 0,
      y: 0,
      cursor: 'move',
      /** @param {MouseEvent} e */
      handler(e) {
        shifter.consume(e);
        const {move} = shifter;
        const {x0, y0, clientX, clientY} = move;
        move.to(x0 + e.clientX - clientX, y0 + e.clientY - clientY);
      },
      init() {
        const {move} = shifter;
        move.x = move.y = 0;
        move.style = cssAppend(':host {}');
      },
      to(x, y) {
        const {move} = shifter;
        move.x = x;
        move.y = y;
        cssProps({transform: `translate(${x}px,${y}px)`}, move.style);
      },
    },
    resize: {
      get cursor() {
        const cl = shifter.target.classList;
        return `n${cl.contains('left') ^ cl.contains('top') ? 'e' : 'w'}-resize`;
      },
      /** @param {MouseEvent} e */
      handler(e) {
        shifter.consume(e);
        const {move, resize, target: {classList}} = shifter;
        const isLeft = classList.contains('left');
        const isTop = classList.contains('top');
        const wRaw = resize.x0 + (e.clientX - resize.clientX) * (isLeft ? -1 : 1);
        const w = Math.min(Math.max(wRaw, MIN_WIDTH), innerWidth, innerHeight * ASPECT_RATIO);
        const h = calcHeight(w);
        const dx = w - resize.x;
        const dy = h - resize.y;
        if (dx || dy) {
          move.to(move.x - dx * isLeft, move.y - dy * isTop);
          resize.to(w, h);
        }
      },
      init() {
        const {resize} = shifter;
        resize.style = cssAppend(cssImportant(/*language=CSS*/ `
          :host {
            width: ${resize.x = config.width}px;
            height: ${resize.y = calcHeight(config.width)}px;
          }`));
      },
      to(w, h) {
        const {resize} = shifter;
        resize.x = w;
        resize.y = h;
        cssProps({width: `${w}px`, height: `${h}px`}, resize.style);
      },
    },
  };

  window.player = {
    get element() {
      return dom.player;
    },
    /**
     * @param {Object} opts
     * @param {string} opts.id
     * @param {boolean} opts.isShared
     * @param {HTMLAnchorElement} opts.link
     * @param {string} opts.time
     */
    create(opts) {
      if (config.strike) strikeLinks(opts.link);
      if (config.history) sendCmd('addToHistory', opts.link.href);
      createDom(opts);
      document.body.appendChild(dom.player);
      setTimeout(() => cssAppend(STYLES.fadein), 250);
      shifter.move.init();
      shifter.resize.init();
      setHoverCancelers(true);
    },
    remove() {
      setHoverCancelers(false);
      hover.stopTimer();
      if (dom.player) {
        if (shifter.target) shifter.stop();
        dom.player.remove();
        dom = {};
      }
    },
  };

  function createDom({id, time, link, isShared}) {
    let frame, thisStyle;
    (dom.player = $div({onmousedown: shifter.onMouseDown}))
      .attachShadow({mode: 'closed'})
      .append(
        dom.style = thisStyle = $create('style',
          STYLES.main +
          (config.dark ? STYLES.dark : '') +
          cssImportant(config.mode === 1 ? calcCenterPos() : calcRelativePos(link))),
        frame = $create('iframe', {
          allowFullscreen: true,
          sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
          onload: () => setTimeout(() => cssAppend(STYLES.loaded, thisStyle), 10e3),
        }),
        dom.resizers = $div({id: 'resizers'}, [
          $div({className: 'top left', onmousedown: shifter.onMouseDown}),
          $div({className: 'top right', onmousedown: shifter.onMouseDown}),
          $div({className: 'bottom right', onmousedown: shifter.onMouseDown}),
          $div({className: 'bottom left', onmousedown: shifter.onMouseDown}),
        ]));
    if (!isShared) {
      frame.src = calcSrc(id, time);
    } else {
      sendCmd('findId', id).then(foundId => {
        if (foundId) {
          frame.src = calcSrc(foundId, time);
        } else {
          cssAppend(STYLES.error, thisStyle);
        }
      });
    }
  }

  function calcCenterPos() {
    return /*language=CSS*/ `
    :host {
      position: fixed;
      left: calc(50% - ${config.width / 2 - config['center-x']}px);
      top: calc(50% - ${config.width / ASPECT_RATIO / 2 - config['center-y']}px);
    }`;
  }

  function calcRelativePos(link) {
    const rect = link.getBoundingClientRect();
    const w = config.width;
    const h = w / ASPECT_RATIO;
    const se = document.scrollingElement || document.body;
    const maxLeft = scrollX + innerWidth - w - 10 - (se.scrollHeight > innerHeight ? 30 : 0);
    const left = Math.max(0, Math.min(maxLeft, rect.left + scrollX + config['relative-x']));
    const top = Math.max(0, rect.bottom + scrollY + config['relative-y']);
    if (config.scroll) {
      const revealX = left < scrollX || left + w > innerWidth + scrollX;
      const revealTop = top < scrollY;
      const revealBottom = top + h > innerHeight + scrollY;
      if (revealX || revealTop || revealBottom) {
        scrollTo({
          left: revealX ? left : scrollX,
          top: Math.max(0,
            revealTop ? top - 10 :
              revealBottom ? top + h - innerHeight + 10 :
                scrollY),
          behavior: config.smooth ? 'smooth' : 'auto',
        });
      }
    }
    return /*language=CSS*/ `
    :host {
      position: absolute;
      left: ${left}px;
      top: ${top}px;
    }`;
  }

  function calcHeight(width) {
    return Math.round(width / ASPECT_RATIO);
  }

  function calcSrc(id, time) {
    const [, h, m, s] = /(?:(\d+)h)?(?:(\d+)m)?(\d+)s/.exec(time) || [];
    return `https://www.youtube.com/embed/${id}?${
      new URLSearchParams({
        fs: 1,
        autoplay: 1,
        enablejsapi: 1,
        // time may be |null| so we can't use a default parameter value
        start: (s | 0) + (m | 0) * 60 + (h | 0) * 3600,
      })
    }`;
  }

  /** @param {KeyboardEvent} e */
  function onkeydown(e) {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (shifter.target) {
        shifter.stop();
      } else {
        player.remove();
      }
    }
  }

  function setHoverCancelers(enable) {
    const method = onOff(enable);
    if (dom.player || !enable) {
      document[method]('click', hover.onclick);
      document[method]('keydown', onkeydown);
    }
  }

  function strikeLinks(link) {
    for (const el of [...document.querySelectorAll(`a[href="${link.href}"]`), link]) {
      el.style['text-decoration'] = 'line-through';
    }
  }

  function $create(tag, props, children) {
    const el = document.createElement(tag);
    if (Array.isArray(props)) {
      children = props;
    } else if (typeof props === 'string') {
      el.textContent = props;
    } else if (props instanceof Node) {
      el.appendChild(props);
    } else if (props) {
      Object.assign(el, props);
    }
    if (children) el.append(...children);
    return el;
  }

  function $div() {
    return $create('div', ...arguments);
  }

  function cssImportant(str) {
    return str.replace(/;\s*/g, '!important;');
  }

  function cssAppend(rule, {sheet} = dom.style) {
    if (sheet) {
      const i = sheet.insertRule(rule, sheet.cssRules.length);
      return Object.assign(sheet.cssRules[i].style, {_ruleIndex: i});
    }
  }

  /**
   * @param {Object<string, string>} props
   * @param {CSSStyleDeclaration} style
   */
  function cssProps(props, style) {
    for (const [name, value] of Object.entries(props))
      style.setProperty(name, value, 'important');
  }
})();