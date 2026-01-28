document.addEventListener("DOMContentLoaded", () => {
  // DOM
  const boardEl = document.getElementById("board");
  const whiteReserveEl = document.getElementById("white-reserve");
  const blackReserveEl = document.getElementById("black-reserve");
  const statusEl = document.getElementById("status");
  const resetBtnEl = document.getElementById("reset-btn");

  // Options UI
  const overlayEl = document.getElementById("options-overlay");
  const startBtnEl = document.getElementById("start-btn");
  const flipBlackEl = document.getElementById("flip-black");

  const customPanelEl = document.getElementById("custom-pieces");
  const clockRulesEl = document.getElementById("clock-rules");
  const piecePickEls = [...document.querySelectorAll(".piece-pick")];

  const clockSecondsEl = document.getElementById("clock-seconds");
  const clockIncrementEl = document.getElementById("clock-increment");

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
    pieceMode: "classic",                 // classic | custom
    customPieces: ["pawn", "rook", "bishop", "knight"],
    clockOn: false,
    clockSeconds: 180,
    clockIncrement: 0,
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

  // Clock state
  let clock = { white: 0, black: 0, id: null };

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

  function stopClock() {
    if (clock.id) clearInterval(clock.id);
    clock.id = null;
  }

  function startClock() {
    stopClock();
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

  function isBoardFull() {
    return board.every(c => c !== null);
  }

  function checkWinner() {
    for (const line of WIN_LINES) {
      const cells = line.map(i => board[i]);
      if (cells.some(c => !c)) continue;
      const owner = cells[0].player;
      if (cells.every(c => c.player === owner)) return owner;
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
        // Pawn moves 1 square orthogonally into an EMPTY square
        const isOrthogonalStep = (adx === 1 && ady === 0) || (adx === 0 && ady === 1);
        if (isOrthogonalStep) return !target;

        // Pawn captures 1 square diagonally IF an enemy piece is present
        const isDiagonalStep = (adx === 1 && ady === 1);
        if (isDiagonalStep) return !!target && target.player !== currentPlayer;

        return false;
      }
      case "king":
        // king-like movement (if used)
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

      if (cell) {
        const span = document.createElement("span");
        span.className = `piece ${cell.player}`; // piece white / piece black
        span.textContent = pieceSymbols[cell.player][cell.piece];
        div.appendChild(span);
      }

      // highlights
      if (!gameOver) {
        if (selectedCell === null && !selectedReservePiece && cell && cell.player === currentPlayer) {
          div.classList.add("highlight-piece");
        }
        if (selectedCell !== null && isValidMove(selectedCell, index)) {
          div.classList.add("highlight-cell");
        }
        if (selectedCell === index) {
          div.classList.add("selected");
        }
      }

      div.onclick = () => onCellClick(index);
      boardEl.appendChild(div);
    });
  }

  function renderReserveFor(player, container) {
    container.innerHTML = "";
    players[player].reserve.forEach(piece => {
      const btn = document.createElement("button");
      btn.className = "piece-btn";
      btn.disabled = gameOver || player !== currentPlayer;

      const span = document.createElement("span");
      span.className = `piece ${player}`;
      span.textContent = pieceSymbols[player][piece];
      btn.appendChild(span);

      btn.onclick = () => {
        if (gameOver || player !== currentPlayer) return;
        selectedReservePiece = piece;
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
    statusEl.textContent = overrideStatus ?? `${players[currentPlayer].name}'s turn`;
  }

  // ---------- Gameplay ----------
  function placePiece(index) {
    board[index] = { player: currentPlayer, piece: selectedReservePiece };

    // remove ONE instance of that piece from reserve
    const r = players[currentPlayer].reserve;
    const i = r.indexOf(selectedReservePiece);
    if (i !== -1) r.splice(i, 1);

    selectedReservePiece = null;

    const winner = checkWinner();
    if (winner) return endGame(`${players[winner].name} wins!`);
    if (isBoardFull()) return endGame("Draw!");

    endTurn(true);
  }

  function movePiece(from, to) {
    const target = board[to];

    // capture returns piece to its owner's reserve
    if (target) {
      players[target.player].reserve.push(target.piece);
    }

    board[to] = board[from];
    board[from] = null;

    const winner = checkWinner();
    if (winner) return endGame(`${players[winner].name} wins!`);
    if (isBoardFull()) return endGame("Draw!");

    endTurn(true);
  }

  function endTurn(applyIncrement) {
    if (settings.clockOn && applyIncrement) {
      // increment goes to the player who just moved
      clock[currentPlayer] += settings.clockIncrement;
      updateClocks();
    }

    currentPlayer = currentPlayer === "white" ? "black" : "white";
    selectedCell = null;
    selectedReservePiece = null;

    if (settings.clockOn) startClock();
    updateUI();
  }

  function onCellClick(index) {
    if (gameOver) return;

    // placing from reserve
    if (selectedReservePiece) {
      if (!board[index]) placePiece(index);
      return;
    }

    // selecting/moving from board
    if (selectedCell === null) {
      if (board[index] && board[index].player === currentPlayer) {
        selectedCell = index;
        renderBoard();
      }
    } else {
      if (isValidMove(selectedCell, index)) {
        movePiece(selectedCell, index);
        return;
      }
      // clicking elsewhere cancels selection
      selectedCell = null;
      renderBoard();
    }
  }

  // ---------- Menu wiring ----------
  function syncPanels() {
    customPanelEl.classList.toggle("hidden", getRadio("opt-pieces") !== "custom");
    clockRulesEl.classList.toggle("hidden", getRadio("opt-clock") !== "on");
  }

  function resetGameState() {
    board = Array(16).fill(null);
    currentPlayer = "white";
    selectedCell = null;
    selectedReservePiece = null;
    gameOver = false;

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

    document.body.classList.toggle("flip-black", settings.flipBlack);

    if (settings.clockOn) {
      whiteClockEl.classList.remove("hidden");
      blackClockEl.classList.remove("hidden");
      updateClocks();
      startClock();
    } else {
      whiteClockEl.classList.add("hidden");
      blackClockEl.classList.add("hidden");
    }

    updateUI("White's turn");
  }

  function startFromMenu() {
    settings.pieceMode = getRadio("opt-pieces") || "classic";
    settings.customPieces = piecePickEls.map(s => s.value).filter(Boolean);
    if (settings.customPieces.length !== 4) settings.customPieces = ["pawn", "rook", "bishop", "knight"];

    settings.clockOn = (getRadio("opt-clock") === "on");
    settings.clockSeconds = Math.max(10, parseInt(clockSecondsEl.value || "180", 10));
    settings.clockIncrement = Math.max(0, parseInt(clockIncrementEl.value || "0", 10));

    settings.flipBlack = !!flipBlackEl.checked;

    overlayEl.classList.add("hidden");
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

  startBtnEl.addEventListener("click", startFromMenu);

  resetBtnEl.addEventListener("click", () => {
    stopClock();
    gameOver = false;
    selectedCell = null;
    selectedReservePiece = null;
    overlayEl.classList.remove("hidden");
    statusEl.textContent = "Choose options to start";
  });

  // Init
  syncPanels();
  overlayEl.classList.remove("hidden");
  statusEl.textContent = "Choose options to start";
});



