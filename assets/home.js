const audienceButtons = Array.from(document.querySelectorAll('[data-audience-toggle]'));
const audienceSections = Array.from(document.querySelectorAll('.audience-section'));
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const audienceStorageKey = 'ump1re_audience';
const modalSetups = [
  {
    modal: document.querySelector('[data-player-modal]'),
    openers: Array.from(document.querySelectorAll('[data-open-player-modal]')),
    closers: Array.from(document.querySelectorAll('[data-close-player-modal]')),
  },
  {
    modal: document.querySelector('[data-club-modal]'),
    openers: Array.from(document.querySelectorAll('[data-open-club-modal]')),
    closers: Array.from(document.querySelectorAll('[data-close-club-modal]')),
  },
];
let activeModal = null;
let lastModalTrigger = null;

const setAudience = (audience) => {
  const next = audience === 'clubs' ? 'clubs' : 'players';
  document.body.dataset.audience = next;
  if (themeColorMeta) {
    themeColorMeta.content = next === 'clubs' ? '#c1e000' : '#24262e';
  }
  audienceButtons.forEach((button) => {
    const active = button.dataset.audienceToggle === next;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  audienceSections.forEach((section) => {
    const visible = section.dataset.audience === next;
    section.hidden = !visible;
  });
  try {
    localStorage.setItem(audienceStorageKey, next);
  } catch (_) {}
};

const storedAudience = (() => {
  try {
    return localStorage.getItem(audienceStorageKey);
  } catch (_) {
    return null;
  }
})();

audienceButtons.forEach((button) => {
  button.addEventListener('click', () => setAudience(button.dataset.audienceToggle));
});

setAudience(storedAudience || document.body.dataset.audience || 'players');

const openModal = (modal, trigger) => {
  const dialog = modal?.querySelector('.plan-modal');
  if (!modal || !dialog) return;
  lastModalTrigger = trigger || document.activeElement;
  activeModal = modal;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => dialog.focus());
};

const closeModal = (modal = activeModal) => {
  if (!modal) return;
  modal.hidden = true;
  activeModal = null;
  document.body.classList.remove('modal-open');
  if (lastModalTrigger && typeof lastModalTrigger.focus === 'function') {
    lastModalTrigger.focus();
  }
};

modalSetups.forEach(({ modal, openers, closers }) => {
  openers.forEach((button) => {
    button.addEventListener('click', () => openModal(modal, button));
  });

  closers.forEach((button) => {
    button.addEventListener('click', () => closeModal(modal));
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && activeModal && !activeModal.hidden) {
    closeModal();
  }
});

document.querySelectorAll('[data-scoreboard-carousel]').forEach((carousel) => {
  const slides = Array.from(carousel.querySelectorAll('.carousel-slide'));
  const dots = Array.from(carousel.querySelectorAll('.carousel-dot'));
  const caption = carousel.querySelector('[data-carousel-caption]');
  let activeIndex = 0;
  let timer;

  const showSlide = (index) => {
    activeIndex = (index + slides.length) % slides.length;

    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle('is-active', slideIndex === activeIndex);
    });

    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle('is-active', dotIndex === activeIndex);
      dot.setAttribute('aria-current', dotIndex === activeIndex ? 'true' : 'false');
    });

    if (caption) {
      caption.textContent = slides[activeIndex].dataset.caption || '';
    }
  };

  const start = () => {
    stop();
    timer = window.setInterval(() => showSlide(activeIndex + 1), 4200);
  };

  const stop = () => {
    if (timer) window.clearInterval(timer);
  };

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      showSlide(Number(dot.dataset.slide || 0));
      start();
    });
  });

  carousel.addEventListener('mouseenter', stop);
  carousel.addEventListener('mouseleave', start);
  carousel.addEventListener('focusin', stop);
  carousel.addEventListener('focusout', start);

  showSlide(0);
  start();
});

if ('serviceWorker' in navigator) {
  const registerWorker = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  };

  if (document.readyState === 'complete') {
    requestAnimationFrame(() => requestAnimationFrame(registerWorker));
  } else {
    window.addEventListener('load', () => {
      requestAnimationFrame(() => requestAnimationFrame(registerWorker));
    }, { once: true });
  }
}
