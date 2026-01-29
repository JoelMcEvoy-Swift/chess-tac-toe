document.addEventListener("DOMContentLoaded", () => {
  // -------------------------------
  // Socket.IO (online multiplayer)
  // -------------------------------
  const socket = io("https://YOUR-SERVICE.onrender.com", { transports: ["websocket", "polling"] });

  let onlineMode = false;
  let onlineReady = false;
  let roomCode = null;
  let myRole = null; // "white" | "black"

  // Online UI
  const createRoomBtnEl = document.getElementById("create-room-btn");
  const joinRoomBtnEl = document.getElementById("join-room-btn");
  const joinCodeEl = document.getElementById("join-code");
  const onlineStatusEl = document.getElementById("online-status");
  const roomPillEl = document.getElementById("room-pill");
  const roomCodeTextEl = document.getElementById("room-code-text");
  const roleTextEl = document.getElementById("role-text");
  const swapSidesBtnEl = document.getElementById("swap-sides-btn");

  // DOM
  const boardEl = document.getElementById("board");
  const whiteReserveEl = document.getElementById("white-reserve");
  const blackReserveEl = document.getElementById("black-reserve");
  const statusEl = document.getElementById("status");

  // Controls
  const menuBtnEl = document.getElementById("menu-btn");
  const restartBtnEl = document.getElementById("restart-btn");

  // Options UI
  const overlayEl = document.getElementById("options-overlay");
  const startBtnEl = document.getElementById("start-btn");
  const flipBlackEl = document.getElementById("flip-black");

  const customPanelEl = document.getElementById("custom-pieces");
  const clockRulesEl = document.getElementById("clock-rules");
  const piecePickEls = [...document.querySelectorAll(".piece-pick")];

  const clockSecondsEl = document.getElementById("clock-seconds");
  const clockIncrementEl = document.getElementById("clock-increment");
  const openingTurnsEl = document.getElementById("opening-turns");

  const whiteClockEl = document.getElementById("white-clock");
  const blackClockEl = document.getElementById("black-clock");

  // Data
  const ALL_PIECES = ["pawn", "rook", "bishop", "knight", "queen", "king"];

  const pieceSymbols = {
    white: { pawn: "♙", rook: "♖", bishop: "♗", knight: "♘", queen: "♕", king: "♔" },
    black: { pawn: "♟", rook: "♜", bishop: "♝", knight: "♞", queen: "♛", king: "♚" }
  };

  // Settings
  let settings = {
    pieceMode: "classic",
    customPieces: ["pawn", "rook", "bishop", "knight"],
    clockOn: false,
    clockSeconds: 180,
    clockIncrement: 0,
    openingTurns: 0,
    flipBlack: false
  };

  // Game state
  let board = Array(16).fill(null);
  let players = {
    white: { name: "White", reserve: [] },
    black: { name: "Black", reserve: [] }
  };
  let currentPlayer = "white";
  let selectedCell = null;
  let selectedReservePiece = null;
  let gameOver = false;

  // Opening phase
  let turnCount = { white: 0, black: 0 };

  // Win highlight
  let winningLine = null;

  // Clock state
  let clock = { white: 0, black: 0, id: null };
  let clockStarted = false;

  // Win lines
  const WIN_LINES = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [8, 9, 10, 11],
    [12, 13, 14, 15],
    [0, 4, 8, 12],
    [1, 5, 9, 13],
    [2, 6, 10, 14],
    [3, 7, 11, 15],
    [0, 5, 10, 15],
    [3, 6, 9, 12]
  ];

  // ---------- Helpers ----------
  function getRadio(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value;
  }

  function setOnlineStatus(text) {
    onlineStatusEl.textContent = text;
  }

  function setRoomPill(code, role) {
    roomPillEl.classList.remove("hidden");
    roomCodeTextEl.textContent = code;
    roleTextEl.textContent = role;
  }

  function setStartEnabled() {
    startBtnEl.disabled = onlineMode && !onlineReady;
    if (swapSidesBtnEl) swapSidesBtnEl.disabled = !(onlineMode && onlineReady);
  }

  function myTurn() {
    if (!onlineMode) return true;
    if (!myRole) return false;
    return currentPlayer === myRole;
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function updateClocks() {
    whiteClockEl.textContent = fmtTime(clock.white);
    blackClockEl.textContent = fmtTime(clock.black);
  }

  function updateActiveClockHighlight() {
    whiteClockEl.classList.remove("active");
    blackClockEl.classList.remove("active");

    if (!settings.clockOn || !clockStarted || gameOver) return;

    if (currentPlayer === "white") whiteClockEl.classList.add("active");
    else blackClockEl.classList.add("active");
  }

  function stopClock() {
    if (clock.id) clearInterval(clock.id);
    clock.id = null;
    updateActiveClockHighlight();
  }

  function startClock() {
    stopClock();
    updateActiveClockHighlight();

    clock.id = setInterval(() => {
      if (gameOver) return;

      clock[currentPlayer] -= 1;
      updateClocks();

      if (clock[currentPlayer] <= 0) {
        clock[currentPlayer] = 0;
        updateClocks();
        const loser = currentPlayer;
        const winner = loser === "white" ? "black" : "white";
        endGame(`${players[winner].name} wins on time!`);
      }
    }, 1000);
  }

  function startClockIfNeeded() {
    if (!settings.clockOn) return;
    if (clockStarted) return;
    if (gameOver) return;

    clockStarted = true;
    startClock();
    updateUI();
  }

  // Online: start clock for BOTH clients when White first touches
  function sendClockStartIfNeeded() {
    if (!onlineMode) return;
    if (!settings.clockOn) return;
    if (clockStarted) return;
    if (gameOver) return;
    if (myRole !== "white") return; // only white initiates

    socket.emit("action", { roomCode, action: { type: "clock-start" } });
  }

  function isBoardFull() {
    return board.every(c => c !== null);
  }

  function checkWinner() {
    for (const line of WIN_LINES) {
      const cells = line.map(i => board[i]);
      if (cells.some(c => !c)) continue;

      const owner = cells[0].player;
      if (cells.every(c => c.player === owner)) {
        return { winner: owner, line };
      }
    }
    return null;
  }

  function endGame(message) {
    gameOver = true;
    selectedCell = null;
    selectedReservePiece = null;
    stopClock();
    updateUI(message);
  }

  function inOpeningPhase() {
    return (
      settings.openingTurns > 0 &&
      (turnCount.white < settings.openingTurns || turnCount.black < settings.openingTurns)
    );
  }

  // ---------- Movement rules ----------
  function isPathClear(from, to, stepX, stepY) {
    const fx = from % 4, fy = Math.floor(from / 4);
    const tx = to % 4, ty = Math.floor(to / 4);

    let x = fx + stepX;
    let y = fy + stepY;

    while (x !== tx || y !== ty) {
      const idx = y * 4 + x;
      if (board[idx]) return false;
      x += stepX;
      y += stepY;
    }
    return true;
  }

  function isValidMove(from, to) {
    if (from === to) return false;
    const piece = board[from];
    if (!piece) return false;

    const target = board[to];
    if (target && target.player === currentPlayer) return false;

    const fx = from % 4, fy = Math.floor(from / 4);
    const tx = to % 4, ty = Math.floor(to / 4);
    const dx = tx - fx, dy = ty - fy;
    const adx = Math.abs(dx), ady = Math.abs(dy);

    switch (piece.piece) {
      case "pawn": {
        const isOrthogonalStep = (adx === 1 && ady === 0) || (adx === 0 && ady === 1);
        if (isOrthogonalStep) return !target;

        const isDiagonalStep = (adx === 1 && ady === 1);
        if (isDiagonalStep) return !!target && target.player !== currentPlayer;

        return false;
      }

      case "king":
        return adx <= 1 && ady <= 1;

      case "rook":
        if (fx !== tx && fy !== ty) return false;
        return isPathClear(from, to, Math.sign(dx), Math.sign(dy));

      case "bishop":
        if (adx !== ady) return false;
        return isPathClear(from, to, Math.sign(dx), Math.sign(dy));

      case "queen":
        if (fx === tx || fy === ty) return isPathClear(from, to, Math.sign(dx), Math.sign(dy));
        if (adx === ady) return isPathClear(from, to, Math.sign(dx), Math.sign(dy));
        return false;

      case "knight":
        return (adx === 2 && ady === 1) || (adx === 1 && ady === 2);

      default:
        return false;
    }
  }

  // ---------- Rendering ----------
  function renderBoard() {
    boardEl.innerHTML = "";
    board.forEach((cell, index) => {
      const div = document.createElement("div");
      div.className = "cell";
      div.dataset.index = index;

      if (winningLine && winningLine.includes(index)) {
        div.classList.add("win-cell");
      }

      if (cell) {
        const span = document.createElement("span");
        span.className = `piece ${cell.player}`;
        span.textContent = pieceSymbols[cell.player][cell.piece];
        div.appendChild(span);
      }

      if (!gameOver) {
        if (selectedCell !== null && isValidMove(selectedCell, index)) {
          div.classList.add("highlight-cell");
        }
        if (selectedCell === index) {
          div.classList.add("selected");
        }
      }

      div.onpointerdown = (e) => {
        e.preventDefault();
        onCellClick(index);
      };

      boardEl.appendChild(div);
    });
  }

  function renderReserveFor(player, container) {
    container.innerHTML = "";
    players[player].reserve.forEach(piece => {
      const btn = document.createElement("button");
      btn.className = "piece-btn";
      btn.disabled = gameOver || player !== currentPlayer || !myTurn();

      const span = document.createElement("span");
      span.className = `piece ${player}`;
      span.textContent = pieceSymbols[player][piece];
      btn.appendChild(span);

      btn.onpointerdown = (e) => {
        e.preventDefault();
        if (gameOver || player !== currentPlayer) return;
        if (!myTurn()) return;

        if (currentPlayer === "white") {
          sendClockStartIfNeeded();
          startClockIfNeeded();
        }

        // Toggle selection so you can change your mind
        selectedReservePiece = (selectedReservePiece === piece) ? null : piece;
        selectedCell = null;
        renderBoard();
      };

      container.appendChild(btn);
    });
  }

  function renderReserves() {
    renderReserveFor("white", whiteReserveEl);
    renderReserveFor("black", blackReserveEl);
  }

  function updateUI(overrideStatus) {
    renderBoard();
    renderReserves();

    if (!overrideStatus && inOpeningPhase()) {
      statusEl.textContent =
        `${players[currentPlayer].name}'s turn — place a piece (${turnCount[currentPlayer]}/${settings.openingTurns})`;
    } else if (!overrideStatus && onlineMode && !myTurn()) {
      statusEl.textContent = `Opponent's turn (${players[currentPlayer].name})`;
    } else {
      statusEl.textContent = overrideStatus ?? `${players[currentPlayer].name}'s turn`;
    }

    updateActiveClockHighlight();
  }

  // ---------- Apply actions (state mutations) ----------
  function placePiece(index, piece) {
    board[index] = { player: currentPlayer, piece };

    const r = players[currentPlayer].reserve;
    const i = r.indexOf(piece);
    if (i !== -1) r.splice(i, 1);

    const result = checkWinner();
    if (result) {
      winningLine = result.line;
      return endGame(`${players[result.winner].name} wins!`);
    }
    if (isBoardFull()) return endGame("Draw!");

    endTurn(true);
  }

  function movePiece(from, to) {
    const target = board[to];
    if (target) {
      players[target.player].reserve.push(target.piece);
    }

    board[to] = board[from];
    board[from] = null;

    const result = checkWinner();
    if (result) {
      winningLine = result.line;
      return endGame(`${players[result.winner].name} wins!`);
    }
    if (isBoardFull()) return endGame("Draw!");

    endTurn(true);
  }

  function endTurn(applyIncrement) {
    turnCount[currentPlayer]++;

    if (settings.clockOn && applyIncrement) {
      clock[currentPlayer] += settings.clockIncrement;
      updateClocks();
    }

    currentPlayer = currentPlayer === "white" ? "black" : "white";
    selectedCell = null;
    selectedReservePiece = null;

    if (settings.clockOn && clockStarted) startClock();
    updateUI();
  }

  // ---------- Send actions (online/offline) ----------
  // Online mode: we emit and WAIT for the server broadcast,
  // so both clients apply the same action stream.
  function sendAction(action) {
    if (!onlineMode) {
      applyIncomingAction(action);
      return;
    }
    if (!roomCode) return;
    socket.emit("action", { roomCode, action });
  }

  function applyIncomingAction(action) {
    if (action.type === "clock-start") {
      startClockIfNeeded();
      return;
    }

    if (action.type === "restart") {
    	closeMenu();              
    resetGameState();
    	return;
	}
	
    if (action.type === "sync-settings") {
      settings = { ...settings, ...action.settings };

      flipBlackEl.checked = !!settings.flipBlack;
      clockSecondsEl.value = String(settings.clockSeconds);
      clockIncrementEl.value = String(settings.clockIncrement);
      openingTurnsEl.value = String(settings.openingTurns);

      document.querySelectorAll('input[name="opt-pieces"]').forEach(r => r.checked = (r.value === settings.pieceMode));
      document.querySelectorAll('input[name="opt-clock"]').forEach(r => r.checked = (r.value === (settings.clockOn ? "on" : "off")));

      if (settings.customPieces?.length === 4) {
        piecePickEls.forEach((sel, i) => sel.value = settings.customPieces[i]);
      }

      syncPanels();
      return;
    }

    if (action.type === "start-game") {
      closeMenu();
      resetGameState();
      return;
    }

    if (action.type === "place") {
      placePiece(action.index, action.piece);
      return;
    }

    if (action.type === "move") {
      movePiece(action.from, action.to);
      return;
    }
  }

  // ---------- Input handling ----------
  function onCellClick(index) {
    if (gameOver) return;
    if (!myTurn()) return;

    const clicked = board[index];

    // placing from reserve
    if (selectedReservePiece) {
      if (!clicked) {
        if (currentPlayer === "white") {
          sendClockStartIfNeeded();
          startClockIfNeeded();
        }
        sendAction({ type: "place", index, piece: selectedReservePiece });
        return;
      }

      // clicking your own piece cancels reserve selection and selects board piece
      if (clicked.player === currentPlayer) {
        selectedReservePiece = null;
        if (currentPlayer === "white") {
          sendClockStartIfNeeded();
          startClockIfNeeded();
        }
        selectedCell = index;
        renderBoard();
      }
      return;
    }

    // selecting/moving from board
    if (selectedCell === null) {
      if (clicked && clicked.player === currentPlayer) {
        if (currentPlayer === "white") {
          sendClockStartIfNeeded();
          startClockIfNeeded();
        }
        selectedCell = index;
        renderBoard();
      }
      return;
    }

    // deselect same
    if (selectedCell === index) {
      selectedCell = null;
      renderBoard();
      return;
    }

    // switch selection
    if (clicked && clicked.player === currentPlayer) {
      selectedCell = index;
      renderBoard();
      return;
    }

    // opening phase blocks movement
    if (inOpeningPhase()) {
      selectedCell = null;
      updateUI("Opening phase: place pieces before moving");
      return;
    }

    // try move/capture
    if (isValidMove(selectedCell, index)) {
      sendAction({ type: "move", from: selectedCell, to: index });
      return;
    }

    selectedCell = null;
    renderBoard();
  }

  // ---------- Menu wiring ----------
  function syncPanels() {
    customPanelEl.classList.toggle("hidden", getRadio("opt-pieces") !== "custom");
    clockRulesEl.classList.toggle("hidden", getRadio("opt-clock") !== "on");
  }

  function openMenu(message = "Choose options") {
    stopClock();
    overlayEl.classList.remove("hidden");
    document.body.classList.add("modal-open");
    statusEl.textContent = message;
  }

  function closeMenu() {
    overlayEl.classList.add("hidden");
    document.body.classList.remove("modal-open");
  }

  function resetGameState() {
    board = Array(16).fill(null);
    currentPlayer = "white";
    selectedCell = null;
    selectedReservePiece = null;
    gameOver = false;

    winningLine = null;
    turnCount = { white: 0, black: 0 };

    const reserve = (settings.pieceMode === "classic")
      ? ["pawn", "rook", "bishop", "knight"]
      : settings.customPieces.slice(0, 4);

    players = {
      white: { name: "White", reserve: [...reserve] },
      black: { name: "Black", reserve: [...reserve] }
    };

    stopClock();
    clock.white = settings.clockSeconds;
    clock.black = settings.clockSeconds;
    clockStarted = false;

    document.body.classList.toggle("flip-black", settings.flipBlack);

    if (settings.clockOn) {
      whiteClockEl.classList.remove("hidden");
      blackClockEl.classList.remove("hidden");
      updateClocks();
      updateActiveClockHighlight();
    } else {
      whiteClockEl.classList.add("hidden");
      blackClockEl.classList.add("hidden");
      updateActiveClockHighlight();
    }

    updateUI("White's turn");
  }

  function readSettingsFromMenu() {
    settings.pieceMode = getRadio("opt-pieces") || "classic";
    settings.customPieces = piecePickEls.map(s => s.value).filter(Boolean);
    if (settings.customPieces.length !== 4) settings.customPieces = ["pawn", "rook", "bishop", "knight"];

    settings.clockOn = (getRadio("opt-clock") === "on");
    settings.clockSeconds = Math.max(10, parseInt(clockSecondsEl.value || "180", 10));
    settings.clockIncrement = Math.max(0, parseInt(clockIncrementEl.value || "0", 10));

    const maxOpening = 4;
    settings.openingTurns = Math.min(
      maxOpening,
      Math.max(0, parseInt(openingTurnsEl.value || "0", 10))
    );

    settings.flipBlack = !!flipBlackEl.checked;
  }

  function startFromMenu() {
    if (onlineMode) {
      if (!onlineReady) return;

      if (myRole !== "white") {
        setOnlineStatus("Waiting for host to start...");
        setStartEnabled();
        return;
      }

      // Host chooses settings
      readSettingsFromMenu();

      // Tell both clients the settings + start
      sendAction({ type: "sync-settings", settings });
      sendAction({ type: "start-game" });

      // IMPORTANT: do NOT reset locally here.
      // We reset when we receive start-game broadcast.
      return;
    }

    // Offline
    readSettingsFromMenu();
    closeMenu();
    resetGameState();
  }

  // Populate custom dropdowns
  piecePickEls.forEach((sel, i) => {
    sel.innerHTML = "";
    for (const p of ALL_PIECES) {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p[0].toUpperCase() + p.slice(1);
      sel.appendChild(opt);
    }
    sel.value = ["pawn", "rook", "bishop", "knight"][i];
  });

  document.addEventListener("change", (e) => {
    if (e.target?.name === "opt-pieces" || e.target?.name === "opt-clock") {
      syncPanels();
    }
  });

  startBtnEl.onpointerdown = (e) => {
    e.preventDefault();
    startFromMenu();
  };

  menuBtnEl.onpointerdown = (e) => {
    e.preventDefault();
    openMenu("Options menu (game paused)");
  };

  restartBtnEl.onpointerdown = (e) => {
    e.preventDefault();
    closeMenu();

    if (onlineMode && roomCode) {
      socket.emit("action", { roomCode, action: { type: "restart" } });
    } else {
      resetGameState();
    }
  };

  // Swap sides (online only)
  if (swapSidesBtnEl) {
    swapSidesBtnEl.onpointerdown = (e) => {
      e.preventDefault();
      if (!(onlineMode && onlineReady && roomCode)) return;
      socket.emit("action", { roomCode, action: { type: "swap-sides" } });
    };
  }

  // -------------------------------
  // Online: socket events
  // -------------------------------
  socket.on("connect", () => {
    setOnlineStatus("Offline mode (local game) — server connected");
  });

  socket.on("room-created", ({ roomCode: code, role }) => {
    onlineMode = true;
    onlineReady = false;
    roomCode = code;
    myRole = role;

    setRoomPill(code, role);
    setOnlineStatus(`Room created. Share code: ${code}. Waiting for opponent...`);
    setStartEnabled();
  });

  socket.on("room-joined", ({ roomCode: code, role }) => {
    onlineMode = true;
    onlineReady = false;
    roomCode = code;
    myRole = role;

    setRoomPill(code, role);
    setOnlineStatus(`Joined room ${code}. Waiting for host to start...`);
    setStartEnabled();
  });

  socket.on("room-ready", ({ roomCode: code }) => {
    onlineMode = true;
    onlineReady = true;
    roomCode = code;

    if (myRole === "white") {
      setOnlineStatus(`Opponent joined. You are White. Configure options, then Start.`);
    } else {
      setOnlineStatus(`Connected. You are Black. Waiting for host to start...`);
    }

    setStartEnabled();
  });

  socket.on("roles-updated", ({ roomCode: code, roles }) => {
    // roles is { socketId: "white"/"black", ... }
    const newRole = roles?.[socket.id];
    if (!newRole) return;
    myRole = newRole;
    setRoomPill(code, myRole);
    setOnlineStatus(`Sides swapped. You are now ${myRole}.`);
    setStartEnabled();
  });

  socket.on("opponent-left", () => {
    onlineReady = false;
    setOnlineStatus("Opponent left. Waiting for opponent...");
    setStartEnabled();
  });

  socket.on("room-error", (msg) => {
    setOnlineStatus(`Online error: ${msg}`);
  });

  socket.on("action", (action) => {
    // Receive actions (including your own) and apply
    applyIncomingAction(action);
  });

  createRoomBtnEl.onpointerdown = (e) => {
    e.preventDefault();
    socket.emit("create-room");
  };

  joinRoomBtnEl.onpointerdown = (e) => {
    e.preventDefault();
    const code = String(joinCodeEl.value || "").trim().toUpperCase();
    if (!code) {
      setOnlineStatus("Enter a room code to join.");
      return;
    }
    socket.emit("join-room", code);
  };

  // Init
  function initMenu() {
    syncPanels();
    openMenu("Choose options to start");
    setStartEnabled();
  }

  initMenu();
});
