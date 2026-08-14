(() => {
  "use strict";

  // No-benefit version: each result artwork links straight to its own
  // episode-1 page instead of a Get-Free-Gems promo link.
  const ARTWORKS = [
    { file: "2. The Dirtiest High.jpg", gemsUrl: "https://manta.net/en/series/the-dirtiest-high-full-ver/episodes/episode-1?episodeId=113637" },
    { file: "3. Salty Lust.jpg", gemsUrl: "https://manta.net/en/series/salty-lust-full-ver/episodes/episode-1?episodeId=138984" },
    { file: "4. Devoured The Serpent and the Pomegranate.jpg", gemsUrl: "https://manta.net/en/series/devoured-the-serpent-and-the-pomegranate-full-ver/episodes/prologue?episodeId=155151" },
    { file: "5. Regas.jpg", gemsUrl: "https://manta.net/en/series/regas/episodes/s1-episode-1?episodeId=123411" },
    { file: "6. The Pizza Delivery Man and Gold Palace.jpg", gemsUrl: "https://manta.net/en/series/the-pizza-delivery-man-and-gold-palace-full-ver/episodes/s1-episode-1?episodeId=88139" },
    { file: "7. To My Dear Horror.jpg", gemsUrl: "https://manta.net/en/series/to-my-dear-horror-full-ver/episodes/prologue?episodeId=159445" },
    { file: "8. One Plus One Delivery Service.jpg", gemsUrl: "https://manta.net/en/series/one-plus-one-delivery-service-full-ver/episodes/episode-1?episodeId=146252" },
    { file: "9. My Sweet Psycho Baby.jpg", gemsUrl: "https://manta.net/en/series/my-sweet-psycho-baby-full-ver/episodes/episode-1?episodeId=154736" },
    { file: "10. Candy Yum Yum.jpg", gemsUrl: "https://manta.net/en/series/candy-yum-yum-full-ver/episodes/episode-1?episodeId=142279" },
    { file: "11. Killer Whale Protocol.jpg", gemsUrl: "https://manta.net/en/series/killer-whale-protocol-full-ver/episodes/s1-episode-1?episodeId=145090" },
    { file: "12. Codename March.jpg", gemsUrl: "https://manta.net/en/series/codename-march-full-ver/episodes/s1-episode-1?episodeId=140378" },
    { file: "13. Between the Lines.jpg", gemsUrl: "https://manta.net/en/series/between-the-lines-full-ver/episodes/s1-episode-1?episodeId=140883" },
    { file: "14. Crack.jpg", gemsUrl: "https://manta.net/en/series/crack-full-ver/episodes/prologue?episodeId=152727" },
    { file: "15. Tied to You.jpg", gemsUrl: "https://manta.net/en/series/tied-to-you/episodes/episode-1?episodeId=135039" },
    { file: "16. Critical Point.jpg", gemsUrl: "https://manta.net/en/series/critical-point-full-ver/episodes/prologue?episodeId=129919" },
    { file: "17. My Rat Is an S-Class Awakener.jpg", gemsUrl: "https://manta.net/en/series/my-rat-is-an-s-class-awakener-full-ver/episodes/s1-episode-1?episodeId=168412" },
  ];

  const MAIN_IMAGE = "1.jpg";
  const SPIN_INTERVAL_MS = 90;
  const NUDGE_DELAY_MS = 3000;
  const REVEAL_DELAY_MS = 1200;
  const CONFETTI_COLORS = ["#a855f7", "#c4b5fd", "#f472b6", "#facc15", "#60a5fa"];

  // Manta wordmark placement, as measured in Photoshop on the 1080x1920
  // artwork template (2.png etc.) — { x, y, w, h } of the logo layer.
  const LOGO_FILE = "Manta_Wordmark_White.png";
  const LOGO_REF_CANVAS = { w: 1080, h: 1920 };
  const LOGO_RECT = { x: 174, y: 358, w: 188, h: 48 };

  const card = document.getElementById("card");
  const mainImage = document.getElementById("mainImage");
  const tooltipWrap = document.getElementById("tooltipWrap");
  const playBtn = document.getElementById("playBtn");
  const spinSound = document.getElementById("spinSound");
  const sheet = document.getElementById("sheet");
  const sheetBackdrop = document.getElementById("sheetBackdrop");
  const retryBtn = document.getElementById("retryBtn");
  const saveBtn = document.getElementById("saveBtn");
  const gemsBtn = document.getElementById("gemsBtn");
  const toast = document.getElementById("toast");
  const confetti = document.getElementById("confetti");

  let state = "idle"; // idle | spinning | revealing | stopped
  let spinTimer = null;
  let nudgeTimer = null;
  let revealTimer = null;
  let currentArtworkIndex = -1;

  spinSound.loop = true;

  // Warms the browser's decoded-image cache for every shuffle frame up
  // front. Without this, each src swap during the spin has to decode a
  // multi-megapixel PNG on the spot, which is what caused the stutter.
  (function preloadImages() {
    [MAIN_IMAGE, ...ARTWORKS.map((a) => a.file)].forEach((file) => {
      const img = new Image();
      img.src = file;
      if (img.decode) img.decode().catch(() => {});
    });
  })();

  function loadImageEl(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // file -> data URL of that artwork with the Manta wordmark burned in.
  const compositedSrc = new Map();
  function displayFile(file) {
    return compositedSrc.get(file) || file;
  }

  async function compositeOne(file, logoImg) {
    const img = await loadImageEl(file);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const scale = canvas.width / LOGO_REF_CANVAS.w;
    ctx.drawImage(
      logoImg,
      LOGO_RECT.x * scale,
      LOGO_RECT.y * scale,
      LOGO_RECT.w * scale,
      LOGO_RECT.h * scale
    );

    const dataUrl = canvas.toDataURL("image/png");
    compositedSrc.set(file, dataUrl);

    // Decode this exact data URL now, off-screen. canvas.toDataURL only
    // encodes bytes — the browser still has to decode them the first
    // time they're handed to <img>, which is what was landing mid-spin
    // and reading as a stutter. Doing that decode here, during preload,
    // means every frame the shuffle ever shows is already warm.
    try {
      const warm = new Image();
      warm.src = dataUrl;
      if (warm.decode) await warm.decode();
    } catch (_) {}

    return dataUrl;
  }

  // Stamps the Manta logo onto every artwork once, up front, at the
  // Photoshop-measured position (scaled to each file's own resolution).
  // Compositing once during preload keeps the shuffle itself just as
  // fast as a plain src swap; nothing gets redrawn during spinning. The
  // intro frame is composited first and is the only thing that reveals
  // <img> — so the page never shows the unbranded artwork before the
  // logo pops in.
  async function buildCompositedImages() {
    let logoImg;
    try {
      logoImg = await loadImageEl(LOGO_FILE);
    } catch (_) {
      // No logo file available — reveal the plain intro image so the
      // game still works, just unbranded, instead of staying blank.
      mainImage.src = MAIN_IMAGE;
      showTooltip();
      return;
    }

    try {
      mainImage.src = await compositeOne(MAIN_IMAGE, logoImg);
    } catch (_) {
      mainImage.src = MAIN_IMAGE;
    }

    // Only invite the first tap once the intro artwork is actually the
    // thing on screen — otherwise the bubble used to pop in well before
    // the (async-composited) image did, so it read as the first/only
    // thing loading instead of arriving together with everything else.
    showTooltip();

    for (const artwork of ARTWORKS) {
      try {
        await compositeOne(artwork.file, logoImg);
      } catch (_) {
        // Leave this one file unbranded rather than breaking the game.
      }
    }
  }
  buildCompositedImages();

  const TARGET_RATIO = 9 / 16;

  // Sizes the card in real px (not vw/dvh) so it works across browsers
  // and embedded app WebViews alike. On phone-shaped viewports (narrower
  // than 9:16) it fills edge to edge, since the artwork's safe margins
  // absorb the slight cover-crop. On wider viewports (desktop web) it
  // instead letterboxes to a true 9:16 card so the layout never gets
  // squashed/cropped into an unrecognizable strip.
  function fitCard() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let w, h;
    if (vw / vh > TARGET_RATIO) {
      h = vh;
      w = h * TARGET_RATIO;
    } else {
      w = vw;
      h = vh;
    }
    card.style.width = w + "px";
    card.style.height = h + "px";

    // The sheet used to size itself off min(430px, 100vw), which drifts
    // out of sync with the card's actual width as soon as the card
    // letterboxes (wide viewport) or the browser's page zoom changes the
    // vw/px relationship. Pin it to the card's real px width instead so
    // it always matches the background behind it.
    sheet.style.width = w + "px";
  }
  fitCard();
  window.addEventListener("resize", fitCard);
  window.addEventListener("orientationchange", fitCard);

  function showTooltip() {
    tooltipWrap.classList.add("show");
  }
  function hideTooltip() {
    tooltipWrap.classList.remove("show");
  }

  // Cycles through the artworks in file order (2, 3, 4, ... then back to
  // the start) instead of picking randomly, so the shuffle always passes
  // through every piece in sequence.
  function pickNextArtworkIndex() {
    return (currentArtworkIndex + 1) % ARTWORKS.length;
  }

  function startSpin() {
    state = "spinning";
    card.classList.add("spinning");
    hideTooltip();

    try {
      spinSound.currentTime = 0;
      spinSound.play().catch(() => {});
    } catch (_) {}

    // Show the first shuffled artwork immediately so the intro image
    // (1.jpg) never flashes on screen once spinning has started.
    currentArtworkIndex = pickNextArtworkIndex();
    mainImage.src = displayFile(ARTWORKS[currentArtworkIndex].file);

    clearInterval(spinTimer);
    spinTimer = setInterval(() => {
      currentArtworkIndex = pickNextArtworkIndex();
      mainImage.src = displayFile(ARTWORKS[currentArtworkIndex].file);
    }, SPIN_INTERVAL_MS);

    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(showTooltip, NUDGE_DELAY_MS);
  }

  function stopSpin() {
    state = "revealing";
    card.classList.remove("spinning");
    hideTooltip();
    clearTimeout(nudgeTimer);
    clearInterval(spinTimer);

    // Keep the BGM going through the reveal/confetti moment and the
    // bottom sheet itself — it only cuts out once the user taps one of
    // the sheet's own buttons (stopBgm, wired up below).
    launchConfetti();

    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => {
      state = "stopped";
      openSheet();
    }, REVEAL_DELAY_MS);
  }

  function stopBgm() {
    spinSound.pause();
    spinSound.currentTime = 0;
  }

  function launchConfetti() {
    confetti.innerHTML = "";
    const pieceCount = 42;
    for (let i = 0; i < pieceCount; i++) {
      const fromLeft = i % 2 === 0;
      const piece = document.createElement("span");
      piece.className = "confetti-piece " + (fromLeft ? "from-left" : "from-right");
      piece.style.top = 8 + Math.random() * 30 + "%";
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      piece.style.animationDelay = Math.random() * 0.2 + "s";
      const spread = 65 + Math.random() * 45; // vw travelled toward the middle
      piece.style.setProperty("--dx", (fromLeft ? spread : -spread) + "vw");
      piece.style.setProperty("--dy", Math.random() * 70 - 40 + "vh");
      piece.style.setProperty("--spin", Math.random() * 900 - 450 + "deg");
      confetti.appendChild(piece);
    }
  }

  playBtn.addEventListener("pointerdown", () => {
    playBtn.classList.remove("pressed");
    void playBtn.offsetWidth;
    playBtn.classList.add("pressed");
  });

  playBtn.addEventListener("click", () => {
    if (state === "spinning") {
      stopSpin();
    } else if (state === "idle") {
      startSpin();
    }
  });

  function openSheet() {
    playBtn.style.visibility = "hidden";
    sheetBackdrop.classList.add("show");
    sheet.classList.add("show");
  }

  function closeSheet() {
    sheetBackdrop.classList.remove("show");
    sheet.classList.remove("show");
    playBtn.style.visibility = "visible";
  }

  function resetToIntro() {
    clearTimeout(nudgeTimer);
    clearTimeout(revealTimer);
    clearInterval(spinTimer);
    stopBgm();
    currentArtworkIndex = -1;
    mainImage.src = displayFile(MAIN_IMAGE);
    state = "idle";
    card.classList.remove("spinning");
    showTooltip();
  }

  retryBtn.addEventListener("click", () => {
    closeSheet();
    resetToIntro();
  });

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  async function saveCurrentImage() {
    stopBgm();
    const file = currentArtworkIndex >= 0 ? ARTWORKS[currentArtworkIndex].file : MAIN_IMAGE;
    const downloadName = "MANTA BL RANDOM MIX.png";

    try {
      const response = await fetch(displayFile(file));
      const blob = await response.blob();

      // App shell bridge hooks: if this page is wrapped in a native
      // WebView, expose one of these to save straight to the gallery.
      const androidBridge = window.AndroidBridge;
      const iosBridge = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.saveImage;

      if (androidBridge && typeof androidBridge.saveImageToGallery === "function") {
        const base64 = await blobToBase64(blob);
        androidBridge.saveImageToGallery(base64, downloadName);
        showToast("Saved to gallery!");
        return;
      }

      if (iosBridge) {
        const base64 = await blobToBase64(blob);
        iosBridge.postMessage({ base64, filename: downloadName });
        showToast("Saved to gallery!");
        return;
      }

      // Plain web fallback: trigger a browser download.
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      showToast("Image saved!");
    } catch (err) {
      showToast("Couldn't save the image.");
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  saveBtn.addEventListener("click", saveCurrentImage);

  gemsBtn.addEventListener("click", () => {
    stopBgm();
    const url = currentArtworkIndex >= 0 ? ARTWORKS[currentArtworkIndex].gemsUrl : "https://manta.net/en";
    window.open(url, "_blank", "noopener");
  });

})();
