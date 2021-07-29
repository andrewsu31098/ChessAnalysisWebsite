// Instantiate game model, view model, stockfish ai, and global variables.
var board = null;
var game = new Chess();
var stock = new Worker('./node_modules/stockfish/src/stockfish.js');
var moveList = '';
var openingMap = {};

var initBoardPos = "startpos";

var promotionOccuring = false;
var analysisOccuring = false;

// Instantiate Opening Book
$.getJSON('./eco.json', function (data) {
    for (let i = 0; i < data.length; i++) {
        openingMap[data[i].fen] = data[i];
    }
});


// STOCKFISH INTERACTION CODE
stock.onmessage = function (e) {
    console.log(e.data);
    var response = e.data.split(' ');
    switch (response[0]) {
        case 'uciok':
            stock.postMessage('setoption name Hash value 32');
            stock.postMessage('isready');
            break;

        case 'readyok':
            stock.postMessage('ucinewgame');
            // Update this fen string if you want a custom start pos.
            // applyFenString('4k3/8/8/pp1p2p1/PPPPPPPP/8/8/4K3 w - - 0 1');
            break;

        case 'bestmove':
            moveList += ' ' + response[1];
            var verbose = __convert_UCI_to_Verbose(response[1]);
            updateChessModel(verbose);
            break;

        default:
            console.log("Default Reached");
    }

}

function sendStockfishLastMove() {
    //Retrieve player's last seen move and send to stockfish worker.
    //Triggers stockfish's reply
    var retrievedMoves = game.history({
        verbose: true
    });
    var startPos = retrievedMoves[retrievedMoves.length - 1].from;
    var endPos = retrievedMoves[retrievedMoves.length - 1].to;
    var promotion = retrievedMoves[retrievedMoves.length - 1].promotion;

    moveList += ' ';
    moveList += startPos;
    moveList += endPos;
    if (promotion) {
        moveList += promotion;
    }

    console.log(retrievedMoves[retrievedMoves.length - 1]);
    console.log(`position ${initBoardPos} moves ${moveList}`);

    stock.postMessage(`position ${initBoardPos} moves ${moveList}`);
    stock.postMessage('go movetime 1000');
}


stock.postMessage('uci');


// UI EVENT HANDLERS
function onDragStart(source, piece, position, orientation) {
    // do not pick up pieces if the game is over
    if (game.game_over()) return false

    // only pick up pieces for White
    if (piece.search(/^b/) !== -1) return false


    // User selects piece they want to promote to. 
    // Game Model, Game UI, then stockfish is all updated with the new move.
    if (promotionOccuring) {
        promotionOccuring = false;
        var correctPromotion = game.undo();
        correctPromotion.promotion = piece.toLowerCase().slice(1);
        updateChessModel(correctPromotion);
        sendStockfishLastMove();
        setDefaultSquareLighting();
        return false;
    }

    if (analysisOccuring) {
        $('#warning-paragraph').text("Moves cannot be made during analysis");
        return false;
    }
}

function onDrop(source, target, piece) {

    // see if the move is legal
    var move = game.move({
        from: source,
        to: target,
        promotion: 'q' // NOTE: always promote to a queen for example simplicity
    })

    // illegal move
    if (move === null) return 'snapback'

}

// update the board position after the piece snap
// for castling, en passant, pawn promotion
function onSnapEnd(source, target, piece) {
    //Update chessboardjs to chessboard model.
    board.position(game.fen())

    // GUI FOR PROMOTION
    if (piece.slice(1).toLowerCase() == 'p' && reachedEndOfBoard('w', target)) {

        var promotionSquares = __promotionOption_squares(target);

        var optionsPosition = {};
        optionsPosition[promotionSquares[0]] = 'wQ';
        optionsPosition[promotionSquares[1]] = 'wN';
        optionsPosition[promotionSquares[2]] = 'wB';
        optionsPosition[promotionSquares[3]] = 'wR';

        board.position(optionsPosition, useAnimation = false);
        promotionOccuring = true;
        darkenAllSquaresExcept(promotionSquares);
    } else {
        sendStockfishLastMove();
    }
}


//HELPER FUNCTIONS 
function __convert_UCI_to_Verbose(uci) {
    // STOCKFISH.JS outputs UCI NOTATION
    // CHESS.JS needs VERBOSE NOTATION. 
    var verbose = {
        from: uci.slice(0, 2),
        to: uci.slice(2, 4)
    };
    if (uci.slice(4)) {
        verbose.promotion = uci.slice(4);
    }
    return verbose;
}

function __convert_chessLetter_to_fullName(chessLetter) {
    var fullname = "";
    switch (chessLetter) {
        case "p":
            fullname = "pawn";
            break;
        case "r":
            fullname = "rook";
            break;
        case "n":
            fullname = "knight";
            break;
        case "b":
            fullname = "bishop";
            break;
        case "k":
            fullname = "King";
            break;
        case "q":
            fullname = "Queen";
            break;
        default:
            fullname = "Error in convert chessletter function";
    }
    return fullname;
}

function __enPassant_change(square) {
    // INCREMENTS NUMBER OF AN ENPASSANT CAPTURE 
    // i.e ) e2 -> e3;
    // USED TO GET THE POSITION OF THE CAPTURED PIECE.
    var changedSquare = parseInt(square.slice(1)) + 1;
    changedSquare = square.slice(0, 1) + changedSquare;
    return changedSquare;
}

function __promotionOption_squares(square) {
    // RETURNS 4 SQUARES TO DISPLAY THE PROMOTION OPTIONS
    var s1 = square;
    var s2 = parseInt(square.slice(1)) - 1;
    s2 = square.slice(0, 1) + s2;
    var s3 = parseInt(square.slice(1)) - 2;
    s3 = square.slice(0, 1) + s3;
    var s4 = parseInt(square.slice(1)) - 3;
    s4 = square.slice(0, 1) + s4;

    var promotionSquares = [s1, s2, s3, s4];
    return promotionSquares;
}

function undoGameState(turnsAgo) {
    // SETS THE GAME MODEL BACK by "turnsAgo" turns.
    // USEFUL FOR RETRIEVING INFORMATION FROM PAST GAME MODEL STATES.
    var moves = [];
    for (let i = 0; i < turnsAgo; i++) {
        moves.push(game.undo());
    }
    return moves;
}

function redoGameState(moveList) {
    // SETS THE GAME MODEL BACK TO ORIGINAL STATE.
    // "moveList" should be provided by "undoGameState"
    for (let i = moveList.length - 1; i > -1; i--) {
        game.move(moveList[i]);
    }
}

function actionReplay(turnsAgo) {
    // RE-ANIMATE A MOVE. ONLY UPDATES VIEW. DOES NOT CHANGE GAME STATE. 

    if (turnsAgo == 0) {
        throw Error("action replay");
    }

    var moves = undoGameState(turnsAgo);

    board.position(game.fen(), useAnimation = false);
    var actionReplayFen = game.fen();
    var moveReplay = moves[moves.length - 1];

    redoGameState(moves);

    board.position(actionReplayFen, useAnimation = false);
    board.move(`${moveReplay.from}-${moveReplay.to}`);
}

function getFileSquares(file) {
    var squares = [];
    for (let i = 1; i < 9; i++) {
        squares.push(file + i);
    }
    return squares;
}

function getDiagonalSquares(start, end) {
    var squares = [];
    var incrementFile = start.slice(0, 1).charCodeAt(0) < end.slice(0, 1).charCodeAt(0);
    var decrementFile = start.slice(0, 1).charCodeAt(0) > end.slice(0, 1).charCodeAt(0);
    var incrementRow = parseInt(start.slice(1)) < parseInt(end.slice(1));
    var decrementRow = parseInt(start.slice(1)) > parseInt(end.slice(1));

    if (!is_Diagonal(start, end))
        throw Error("getDiagonalSquares");

    squares.push(start);
    if (incrementFile && incrementRow) {
        while (start !== end) {
            start = __increment_file(start);
            start = __increment_row(start);
            squares.push(start);
        }
    } else if (incrementFile && decrementRow) {
        while (start !== end) {
            start = __increment_file(start);
            start = __decrement_row(start);
            squares.push(start);
        }
    } else if (decrementFile && incrementRow) {
        while (start !== end) {
            start = __decrement_file(start);
            start = __increment_row(start);
            squares.push(start);
        }
    } else if (decrementFile && decrementRow) {
        while (start !== end) {
            start = __decrement_file(start);
            start = __decrement_row(start);
            squares.push(start);
        }
    }
    return squares;
}


function isNextTo(square1, square2) {
    var left = __decrement_file(square1);
    var right = __increment_file(square1);
    var up = __increment_row(square1);
    var down = __decrement_row(square1);
    var nw = __decrement_file(__increment_row(square1));
    var ne = __increment_file(__increment_row(square1));
    var sw = __decrement_file(__decrement_row(square1));
    var se = __increment_file(__decrement_row(square1));
    var neighbors = [left, right, up, down, nw, ne, sw, se];
    for (let i = 0; i < neighbors.length; i++) {
        if (neighbors[i] == square2)
            return true;
    }
    if (square1 == square2)
        return true;
    return false;
}

function getAdjKing(color, square) {
    // RETURNS KINGS SQUARE IF ADJACENT TO THE GIVEN SQUARE. NULL OTHERWISE
    var squareFileCode = square.slice(0, 1).charCodeAt(0);
    var squareRow = parseInt(square.slice(1));
    var kingsSquare = null;
    var adj1 = null;
    var adj2 = null;

    if (color === 'w') {
        adj1 = String.fromCharCode(squareFileCode - 1) + (squareRow - 1);
        adj2 = String.fromCharCode(squareFileCode + 1) + (squareRow - 1);
    } else if (color === 'b') {
        adj1 = String.fromCharCode(squareFileCode - 1) + (squareRow + 1);
        adj2 = String.fromCharCode(squareFileCode + 1) + (squareRow + 1);
    } else {
        throw new Error('getAdjKing error');
    }

    var adjOneObject = game.get(adj1);
    var adjTwoObject = game.get(adj2);
    if (adjOneObject && adjOneObject.type === 'k' && adjOneObject.color === color) {
        kingsSquare = adj1;
    }
    if (adjTwoObject && adjTwoObject.type === 'k' && adjTwoObject.color === color) {
        kingsSquare = adj2;
    }

    return kingsSquare;

}

function __increment_file(square) {
    var squareFileCode = square.slice(0, 1).charCodeAt(0);
    var squareRow = square.slice(1);
    return String.fromCharCode(squareFileCode + 1) + squareRow;
}

function __increment_row(square) {
    var squareFile = square.slice(0, 1);
    var squareRow = parseInt(square.slice(1));
    return squareFile + (squareRow + 1);
}

function __decrement_file(square) {
    var squareFileCode = square.slice(0, 1).charCodeAt(0);
    var squareRow = square.slice(1);
    return String.fromCharCode(squareFileCode - 1) + squareRow;
}

function __decrement_row(square) {
    var squareFile = square.slice(0, 1);
    var squareRow = parseInt(square.slice(1));
    return squareFile + (squareRow - 1);
}

function extrapolateDiagonal(color, start, end) {
    // Takes two ends of a short diagonal, returns the end-point of the long diagonal.
    var matchingIncFile = end.slice(0, 1) === __increment_file(start).slice(0, 1);
    var matchingDecFile = end.slice(0, 1) === __decrement_file(start).slice(0, 1);
    var matchingIncRow = parseInt(start.slice(1)) + 1 == end.slice(1);
    var matchingDecRow = parseInt(start.slice(1)) - 1 == end.slice(1);

    if (matchingIncFile && matchingIncRow && color == 'w') {
        while (!reachedSideOfBoard(end)) {
            end = __increment_file(end);
            end = __increment_row(end);
        }
    } else if (matchingDecFile && matchingIncRow && color == 'w') {
        while (!reachedSideOfBoard(end)) {
            end = __decrement_file(end);
            end = __increment_row(end);
        }
    } else if (matchingIncFile && matchingDecRow && color == 'b') {
        while (!reachedSideOfBoard(end)) {
            end = __increment_file(end);
            end = __decrement_row(end);
        }
    } else if (matchingDecFile && matchingDecRow && color == 'b') {
        while (!reachedSideOfBoard(end)) {
            end = __decrement_file(end);
            end = __decrement_row(end);
        }
    } else {
        throw Error("extrapolate Diagonal");
    }

    return end;
}

function is_Diagonal(start, end) {
    var startFile = start.slice(0, 1);
    var startRow = parseInt(start.slice(1));

    var endFile = end.slice(0, 1);
    var endRow = parseInt(end.slice(1));

    var startCode = startFile.charCodeAt(0);
    var endCode = endFile.charCodeAt(0);
    if (Math.abs(startRow - endRow) === Math.abs(startCode - endCode)) {
        return true;
    }
    return false;
}

function allPiecesBetween(color, piece, start, end) {
    var startFile = start.slice(0, 1);
    var endFile = end.slice(0, 1);
    var squares = [];

    if (startFile === endFile) {
        var foundSquare = pieceBetween(color, piece, start, end);

        while (foundSquare && parseInt(foundSquare.slice(1)) <= 8) {
            squares.push(foundSquare);
            foundSquare = pieceBetween(color, piece, __increment_row(foundSquare), startFile + '8');
        }
    }

    if (squares.length == 0) {
        return false;
    }
    return squares;
}

function pieceBetween(color, piece, start, end) {
    // CHECKS IF A PIECE EXISTS BETWEEN TWO SQUARES
    // RETURNS SQUARE IF FOUND, FALSE OTHERWISE;
    // WORKS ONLY ON DIAGONALS AND FILES
    var startFile = start.slice(0, 1);
    var startRow = parseInt(start.slice(1));
    var endFile = end.slice(0, 1);
    var endRow = parseInt(end.slice(1));

    //SAME SQUARE
    if (start == end) {
        let pieceObject = game.get(start);
        if (pieceObject && piece === pieceObject.type && color === pieceObject.color) {
            return start;
        }
        return false;
    }
    // SAME FILE
    if (startFile === endFile) {
        // Sanitizing Input so start < end before iteration.
        let temp = startRow;
        startRow = (startRow < endRow) ? startRow : endRow;
        endRow = (startRow === endRow) ? temp : endRow;

        for (let i = startRow; i < endRow + 1; i++) {
            let pieceObject = game.get(startFile + i);
            if (pieceObject && piece === pieceObject.type && color === pieceObject.color) {
                return startFile + i;
            }
        }
        return false;
    } else {
        // SAME DIAGONAL
        if (!is_Diagonal(start, end)) {
            throw Error("piece_between_two_squares received neither a diagonal nor file");
        }
        var startFileCode = startFile.charCodeAt(0);
        var endFileCode = endFile.charCodeAt(0);
        if (startRow < endRow) {
            for (let i = 0; i < endRow - startRow + 1; i++) {
                let newFile = String.fromCharCode(startFileCode + i);
                let newRow = startRow + i;
                let pieceObject = game.get(newFile + newRow);
                if (pieceObject && pieceObject.type === piece && pieceObject.color === color) {
                    return newFile + newRow;
                }
            }
            return false;
        } else {
            for (let i = 0; i < startRow - endRow + 1; i++) {
                let newFile = String.fromCharCode(startFileCode + i);
                let newRow = startRow - i;
                let pieceObject = game.get(newFile + newRow);
                if (pieceObject && pieceObject.type === piece && pieceObject.color === color) {
                    return newfile + newRow;
                }
            }
            return false;
        }

    }

}

function __diagonal_is_weak(color, start, end) {
    var numPawnDefenders = 0;

    if (!is_Diagonal(start, end)) {
        return false;
    }

    var startFile = start.slice(0, 1);
    var startFileCode = startFile.charCodeAt(0);
    var startRow = parseInt(start.slice(1));

    var endFile = end.slice(0, 1);
    var endRow = parseInt(end.slice(1));

    if (startRow < endRow) {
        for (let i = 0; i < endRow - startRow + 1; i++) {
            let newFile = String.fromCharCode(startFileCode + i);
            let newRow = startRow + i;
            if (pieceBetween(color, 'p', newFile + '1', newFile + newRow)) {
                numPawnDefenders++;
            }
        }
    } else {
        for (let i = 0; i < startRow - endRow + 1; i++) {
            let newFile = String.fromCharCode(startFileCode + i);
            let newRow = startRow - i;
            if (pieceBetween(color, 'p', newFile + '1', newFile + newRow)) {
                numPawnDefenders++;
            }
        }
    }
    return (numPawnDefenders < 4);
}

function isIsolatedPawn(color, square) {
    var adj1 = __decrement_file(square);
    var adj2 = __increment_file(square);
    adj1 = getFileSquares(adj1.slice(0, 1));
    adj2 = getFileSquares(adj2.slice(0, 1));

    var leftHasPawns = pieceBetween(color, 'p', adj1[0], adj1[adj1.length - 1]);
    var rightHasPawns = pieceBetween(color, 'p', adj2[0], adj2[adj2.length - 1]);
    var centerHasMultiplePawns = pieceBetween(color, 'p', square[0] + '1', square[0] + '8');
    if (!centerHasMultiplePawns) {
        throw Error("isIsolatedPawn called on a non-pawn square");
    }

    centerHasMultiplePawns = pieceBetween(color, 'p', __increment_row(centerHasMultiplePawns), centerHasMultiplePawns[0] + '8');
    return !(leftHasPawns || rightHasPawns) && !centerHasMultiplePawns;
}

function checkPawnIsolation(analysis, gHistory) {
    //TODO: Check pawn isolation on pawn capture-promotion.
    //TODO: Black and white pawns that isolate each other on capture and end on the same file are not reported as isolated.
    var blackLastMove = gHistory[gHistory.length - 1];
    var whiteLastMove = gHistory[gHistory.length - 2];

    var leftFile;
    var rightFile;
    var leftSidePawn;
    var rightSidePawn;

    // Check if black pawn isolates itself on capture.
    if (blackLastMove.piece === 'p' && blackLastMove.captured) {
        if (isIsolatedPawn('b', blackLastMove.to)) {
            var moves = undoGameState(1);
            if (!isIsolatedPawn('b', blackLastMove.from)) {
                var pawnObject = {};
                pawnObject.statement = `Black's capture has left his ${blackLastMove.to} pawn isolated.`;
                pawnObject.squares = [blackLastMove.to];
                pawnObject.turn = 'b';
                analysis.pros.push(pawnObject);
            }
            redoGameState(moves);
        }
    }
    // Check if black pawn isolates white piece on capture.
    leftFile = getFileSquares(__decrement_file(blackLastMove.to).slice(0, 1));
    rightFile = getFileSquares(__increment_file(blackLastMove.to).slice(0, 1));
    leftSidePawn = pieceBetween('w', 'p', leftFile[0], leftFile[leftFile.length - 1]);
    rightSidePawn = pieceBetween('w', 'p', rightFile[0], rightFile[rightFile.length - 1]);

    if (blackLastMove.captured === 'p' && (leftSidePawn || rightSidePawn) && !reachedEndOfBoard('b', blackLastMove.to)) {
        if (leftSidePawn && isIsolatedPawn('w', leftSidePawn)) {
            var pawnObject = {};
            pawnObject.statement = `Black's capture left white's ${leftSidePawn} pawn isolated`;
            pawnObject.squares = [leftSidePawn];
            pawnObject.turn = 'b';
            analysis.cons.push(pawnObject);
        }
        if (rightSidePawn && isIsolatedPawn('w', rightSidePawn)) {
            var pawnObject = {};
            pawnObject.statement = `Black's capture left white's ${rightSidePawn} pawn isolated`;
            pawnObject.squares = [rightSidePawn];
            pawnObject.turn = 'b';
            analysis.cons.push(pawnObject);
        }
    }


    // Check if white pawn isolates itself on capture.
    if (whiteLastMove.piece === 'p' && whiteLastMove.captured && !reachedEndOfBoard('w', whiteLastMove.to)) {
        if (isIsolatedPawn('w', whiteLastMove.to)) {
            var moves = undoGameState(2);
            if (!isIsolatedPawn('w', whiteLastMove.from)) {
                var pawnObject = {};
                pawnObject.statement = `White's capture has left his ${whiteLastMove.to} pawn isolated.`;
                pawnObject.squares = [whiteLastMove.to];
                pawnObject.turn = 'w';
                analysis.cons.push(pawnObject);
            }
            redoGameState(moves);
        }
    }
    // Check if white pawn isolates black piece on capture.
    leftFile = getFileSquares(__decrement_file(whiteLastMove.to).slice(0, 1));
    rightFile = getFileSquares(__increment_file(whiteLastMove.to).slice(0, 1));
    leftSidePawn = pieceBetween('b', 'p', leftFile[0], leftFile[leftFile.length - 1]);
    rightSidePawn = pieceBetween('b', 'p', rightFile[0], rightFile[rightFile.length - 1]);

    if (whiteLastMove.captured === 'p' && (leftSidePawn || rightSidePawn)) {
        if (leftSidePawn && isIsolatedPawn('b', leftSidePawn)) {
            var pawnObject = {};
            pawnObject.statement = `White's capture left black's ${leftSidePawn} pawn isolated`;
            pawnObject.squares = [leftSidePawn];
            pawnObject.turn = 'w';
            analysis.pros.push(pawnObject);
        }
        if (rightSidePawn && isIsolatedPawn('b', rightSidePawn)) {
            var pawnObject = {};
            pawnObject.statement = `White's capture left black's ${rightSidePawn} pawn isolated`;
            pawnObject.squares = [rightSidePawn];
            pawnObject.turn = 'w';
            analysis.pros.push(pawnObject);
        }
    }
}

function isDoubledPawn(color, square) {
    var pawnSquares = [];
    var pSquare = pieceBetween(color, 'p', square[0] + '1', square[0] + '8');
    while (pSquare) {
        pawnSquares.push(pSquare);
        pSquare = pieceBetween(color, 'p', __increment_row(pSquare), pSquare[0] + '8');
    }
    if (pawnSquares.length <= 1)
        return false;
    return pawnSquares;
}

function checkDoubledPawns(analysis, gHistory) {
    var blackLastMove = gHistory[gHistory.length - 1];
    var whiteLastMove = gHistory[gHistory.length - 2];
    var blackDoubledPawns;
    var whiteDoubledPawns;
    if (blackLastMove.captured && blackLastMove.piece === 'p' && !reachedEndOfBoard('b', blackLastMove.to)) {
        blackDoubledPawns = isDoubledPawn('b', blackLastMove.to);
        if (blackDoubledPawns) {
            var doubledPawnObject = {};
            doubledPawnObject.statement = "Blacks capture has doubled his pawns";
            doubledPawnObject.squares = blackDoubledPawns;
            doubledPawnObject.turn = 'b';
            analysis.pros.push(doubledPawnObject);
        }
    }
    if (whiteLastMove.captured && whiteLastMove.piece === 'p' && !reachedEndOfBoard('w', whiteLastMove.to)) {
        whiteDoubledPawns = isDoubledPawn('w', whiteLastMove.to);
        if (whiteDoubledPawns) {
            var doubledPawnObject = {};
            doubledPawnObject.statement = "Whites capture has doubled his pawns";
            doubledPawnObject.squares = whiteDoubledPawns;
            doubledPawnObject.turn = 'w';
            analysis.cons.push(doubledPawnObject);
        }
    }
}

function isPassedPawn(color, square) {
    if (game.get(square).type !== 'p')
        throw Error("isPassedPawn not passed a pawn");
    var enemyColor = (color == 'w') ? 'b' : 'w';
    var leftFile = getFileSquares(__decrement_file(square).slice(0, 1));
    var centerFile = getFileSquares(square.slice(0, 1));
    var rightFile = getFileSquares(__increment_file(square).slice(0, 1));

    if (color === 'w') {
        return (!pieceBetween(enemyColor, 'p', __increment_row(__decrement_file(square)), leftFile[leftFile.length - 1]) &&
            !pieceBetween(enemyColor, 'p', __increment_row(square), centerFile[centerFile.length - 1]) &&
            !pieceBetween(enemyColor, 'p', __increment_row(__increment_file(square)), rightFile[rightFile.length - 1]));
    } else if (color === 'b') {
        return (!pieceBetween(enemyColor, 'p', leftFile[0], __decrement_row(__decrement_file(square))) &&
            !pieceBetween(enemyColor, 'p', centerFile[0], __decrement_row(square)) &&
            !pieceBetween(enemyColor, 'p', rightFile[0], __decrement_row(__increment_file(square))));
    }

}

function checkPassedPawns(analysis, gHistory) {
    var blackLastMove = gHistory[gHistory.length - 1];
    var whiteLastMove = gHistory[gHistory.length - 2];

    if (blackLastMove.piece === 'p' && blackLastMove.flags.includes('n')) {
        if (isPassedPawn('b', blackLastMove.to)) {
            var passedPawnObject = {};
            passedPawnObject.statement = `Black's forward move has created a passed pawn on ${blackLastMove.to}`;
            passedPawnObject.squares = [blackLastMove.to];
            passedPawnObject.turn = 'b';
            analysis.cons.push(passedPawnObject);
        }
    }
    if (blackLastMove.captured === 'p') {
        var travelingSquare = __decrement_file(blackLastMove.to);
        for (let i = 0; i < 3; i++) {
            var pawns = allPiecesBetween('b', 'p', travelingSquare.slice(0, 1) + '1', travelingSquare.slice(0, 1) + '8');
            if (pawns) {
                for (let i = 0; i < pawns.length; i++) {
                    if (isPassedPawn('b', pawns[i])) {
                        var passedPawnObject = {};
                        passedPawnObject.statement = `Black gained a passed pawn on ${pawns[i]}`;
                        passedPawnObject.squares = [pawns[i]];
                        passedPawnObject.turn = 'b';
                        analysis.cons.push(passedPawnObject);
                    }
                }
            }
            travelingSquare = __increment_file(travelingSquare);
        }
    }

    if (whiteLastMove.piece === 'p' && whiteLastMove.flags.includes('n')) {
        if (isPassedPawn('w', whiteLastMove.to)) {
            var passedPawnObject = {};
            passedPawnObject.statement = `White's forward move has created a passed pawn on ${whiteLastMove.to}`;
            passedPawnObject.squares = [whiteLastMove.to];
            passedPawnObject.turn = 'w';
            analysis.pros.push(passedPawnObject);
        }
    }
    if (whiteLastMove.captured === 'p') {
        var travelingSquare = __decrement_file(whiteLastMove.to);
        for (let i = 0; i < 3; i++) {
            var pawns = allPiecesBetween('w', 'p', travelingSquare.slice(0, 1) + '1', travelingSquare.slice(0, 1) + '8');
            if (pawns) {
                for (let i = 0; i < pawns.length; i++) {
                    if (isPassedPawn('w', pawns[i])) {
                        var passedPawnObject = {};
                        passedPawnObject.statement = `White gained a passed pawn on ${pawns[i]}`;
                        passedPawnObject.squares = [pawns[i]];
                        passedPawnObject.turn = 'w';
                        analysis.pros.push(passedPawnObject);
                    }
                }
            }
            travelingSquare = __increment_file(travelingSquare);
        }
    }

}


function getOpponentMoves() {
    // RETURN OPPONENTS POTENTIAL MOVES (WHEN IT'S NOT THEIR TURN)
    let gameFen = game.fen();
    let gamePGN = game.pgn()

    game.load(gameFen);
    let tokens = game.fen().split(' ')
    tokens[1] = tokens[1] === 'w' ? 'b' : 'w';
    tokens[3] = '-';

    game.load(tokens.join(' '))
    let moves = game.moves({
        verbose: true
    })

    tokens = game.fen().split(' ')
    tokens[1] = tokens[1] === 'w' ? 'b' : 'w'

    game.load_pgn(gamePGN)

    return moves
}

function placeKingInRandomSafeSquare(color, squareOfInterest) {
    for (let row = 1; row < 9; row++) {
        for (let col = 0; col < 8; col++) {
            var square = String.fromCharCode('a'.charCodeAt(0) + col) + row;
            if (!game.get(square) && !isNextTo(square, squareOfInterest)) {
                game.put({
                    color: color,
                    type: 'k'
                }, square);
                if (game.in_check()) {
                    game.remove(square);
                } else {
                    return square;
                }
            }

        }
    }
}

function removeKingFromRandomSquare(square) {
    game.remove(square);
}

function getNumDefenders(color, square) {
    // RETURNS NUMBER OF DEFENDERS TO A SQUARE
    // CODE:: 1. REMOVES PIECE ON "square". 2. PLACES ENEMY PIECE ON "square".
    // CODE:: 3. RETURNS HOW MANY PIECES CAN CAPTURE ON "square". 4. REVERT TO ORIGINAL. 
    // CODE:: 4.5 IF PIECE ON "square" IS KING, PLACE SOMEWHERE ELSE, BECAUSE CANNOT REMOVE.
    var enemyColor = (color === 'w') ? 'b' : 'w';
    var defenderNum = 0;
    var originalPiece = game.remove(square);
    var fakeKingsSquare;
    if (originalPiece && originalPiece.type == 'k' && originalPiece.color == color) {
        fakeKingsSquare = placeKingInRandomSafeSquare(color, square);
    }

    game.put({
        type: 'p',
        color: enemyColor
    }, square);

    var moves = (color == game.turn()) ? game.moves({
        verbose: true
    }) : getOpponentMoves();
    for (let i = 0; i < moves.length; i++) {
        if (moves[i].color === color && moves[i].to === square && moves[i].flags.includes('c'))
            defenderNum++;
    }

    game.remove(square);

    if (originalPiece && originalPiece.type == 'k' && originalPiece.color == color) {
        removeKingFromRandomSquare(fakeKingsSquare);
    }
    if (originalPiece) {
        game.put({
            color: originalPiece.color,
            type: originalPiece.type
        }, square)
    }
    return defenderNum;
}


function reachedEndOfBoard(color, square) {
    // NEEDS UPDATING IF WANTING TO ALLOW BLACK PLAY
    if (color == 'w')
        return (square.slice(1) === '8');
    else
        return (square.slice(1) === '1');
}

function reachedSideOfBoard(square) {
    return (square.slice(0, 1) === 'a' || square.slice(0, 1) === 'h');
}

function updateChessModel(verbose) {
    // GIVES MOVE TO CHESS.JS MODEL.
    // UPDATES CHESSBOARD.JS VIEW.
    var possibleMoves = game.moves()

    // game over
    if (possibleMoves.length === 0) return

    game.move(verbose);
    board.position(game.fen())
}

function applyFenString(fen) {
    // UPDATE THE BOARD TO PLAY WITH A GIVEN FEN STRING
    // UPDATES chess.js, chessboard.js, stockfish.js.
    if (!game.load(fen)) {
        throw Error("chess.js failed to load");
    }
    board.position(game.fen(), useAnimation = false);
    initBoardPos = "fen " + fen;

}

function darkenAllSquaresExcept(squares) {
    $('.square-55d63').css('opacity', '0.1');
    for (let i = 0; i < squares.length; i++) {
        $('.square-' + squares[i]).css('opacity', '1.0');
    }
}

function setDefaultSquareLighting() {
    $('.square-55d63').css('opacity', '1.0');
    $('.white-1e1d7').css('background-color', '#f0d9b5');
    $('.black-3c85d').css('background-color', '#b58863');
}

function highlightSquares(squares) {
    for (let i = 0; i < squares.length; i++) {
        $('.square-' + squares[i]).css('background-color', '#69140e');
    }

}

function resetButtons() {
    $('#pros-analysis li').css("background-color", "");
    $('#cons-analysis li').css("background-color", "");
    $('#neutral-analysis li').css("background-color", "");
    $('#warning-paragraph').empty();

    setDefaultSquareLighting();
    board.position(game.fen(), useAnimation = false);

    explainCounter = 0;
    explainLength = 0;
    $('#next-button').hide();
    $('#analysis-button').show();
    analysisOccuring = false;
}

//MY CODE: Board Analysis Functions
function analyzeMaterial(analysis, gHistory) {
    var blackLastMove = gHistory[gHistory.length - 1];
    var whiteLastMove = gHistory[gHistory.length - 2];

    if (blackLastMove.captured) {
        // Need to account for enpassant captures.
        var squareCaptured = (blackLastMove.flags.includes('e') ? __enPassant_change(blackLastMove.to) : blackLastMove.to);
        var lostPieceCon = `Loss of material: ${__convert_chessLetter_to_fullName(blackLastMove.captured)} on ${squareCaptured}`;
        var materialObject = {
            statement: lostPieceCon,
            squares: [squareCaptured],
            turn: 'b'
        }
        analysis.cons.push(materialObject);

    }

    if (whiteLastMove.captured) {
        // Need to account for enpassant captures.
        var squareCaptured = (whiteLastMove.flags.includes('e') ? __enPassant_change(whiteLastMove.to) : whiteLastMove.to);
        var wonPiecePro = `Won material: ${__convert_chessLetter_to_fullName(whiteLastMove.captured)} on ${squareCaptured}`;
        var materialObject = {
            statement: wonPiecePro,
            squares: [squareCaptured],
            turn: 'w'
        }
        analysis.pros.push(materialObject);
    }
}

function analyzeFiles(analysis, gHistory) {
    var blackLastMove = gHistory[gHistory.length - 1];
    var whiteLastMove = gHistory[gHistory.length - 2];


    if (blackLastMove.captured && blackLastMove.piece === "p") {
        var fileOpened = blackLastMove.from.slice(0, 1);
        var fileStatement = "";

        if (pieceBetween('w', 'p', fileOpened + '1', fileOpened + '8') && !pieceBetween('b', 'p', fileOpened + '1', fileOpened + '8')) {
            fileStatement = `Black's pawn capture created a semi-open ${fileOpened} file.`;
        } else if (!pieceBetween('w', 'p', fileOpened + '1', fileOpened + '8') && pieceBetween('b', 'p', fileOpened + '1', fileOpened + '8')) {
            fileStatement = `Black's pawn capture created a semi-open ${fileOpened} file.`;
        } else if (!pieceBetween('w', 'p', fileOpened + '1', fileOpened + '8') && !pieceBetween('b', 'p', fileOpened + '1', fileOpened + '8')) {
            fileStatement = `Black's pawn capture opened the ${fileOpened} file.`;
        }
        var fileObject = {
            statement: fileStatement,
            squares: getFileSquares(fileOpened),
            turn: 'b'
        }
        analysis.neutral.push(fileObject)
    }

    if (whiteLastMove.captured && whiteLastMove.piece === "p") {
        var fileOpened = whiteLastMove.from.slice(0, 1);
        var fileStatement = "";

        if (pieceBetween('b', 'p', fileOpened + '1', fileOpened + '8') && !pieceBetween('w', 'p', fileOpened + '1', fileOpened + '8')) {
            fileStatement = `White's pawn capture created a semi-open ${fileOpened} file.`;
        } else if (!pieceBetween('b', 'p', fileOpened + '1', fileOpened + '8') && pieceBetween('w', 'p', fileOpened + '1', fileOpened + '8')) {
            fileStatement = `White's pawn capture created a semi-open ${fileOpened} file.`;
        } else if (!pieceBetween('b', 'p', fileOpened + '1', fileOpened + '8') && !pieceBetween('w', 'p', fileOpened + '1', fileOpened + '8')) {
            fileStatement = `White's pawn capture opened the ${fileOpened} file.`;
        }
        var fileObject = {
            statement: fileStatement,
            squares: getFileSquares(fileOpened),
            turn: 'w'
        }
        analysis.neutral.push(fileObject);
    }

}

function analyzeDiagonals(analysis, gHistory) {
    var blackLastMove = gHistory[gHistory.length - 1];
    var whiteLastMove = gHistory[gHistory.length - 2];

    var startSquare = null;
    var endSquare = null;


    if (blackLastMove.piece === 'p' && getAdjKing('b', blackLastMove.from)) {
        startSquare = getAdjKing('b', blackLastMove.from);
        endSquare = extrapolateDiagonal('b', startSquare, blackLastMove.from);
        if (__diagonal_is_weak('b', startSquare, endSquare)) {
            var diagonalObject = {};
            diagonalObject.statement = `${startSquare} to ${endSquare} diagonal weakened for Black`;
            diagonalObject.squares = getDiagonalSquares(startSquare, endSquare);
            diagonalObject.turn = 'b';
            analysis.pros.push(diagonalObject);
        }

    }
    if (whiteLastMove.piece === 'p' && getAdjKing('w', whiteLastMove.from)) {
        startSquare = getAdjKing('w', whiteLastMove.from);
        endSquare = extrapolateDiagonal('w', startSquare, whiteLastMove.from);
        if (__diagonal_is_weak('w', startSquare, endSquare)) {
            var diagonalObject = {};
            diagonalObject.statement = `${startSquare} to ${endSquare} diagonal weakened for White`;
            diagonalObject.squares = getDiagonalSquares(startSquare, endSquare);
            diagonalObject.turn = 'w';
            analysis.cons.push(diagonalObject);
        }
    }
}

function analyzePawnStructure(analysis, gHistory) {
    checkPawnIsolation(analysis, gHistory);
    checkDoubledPawns(analysis, gHistory);
    checkPassedPawns(analysis, gHistory);
}


function analyzePosition() {
    // Return analysis object. {pros: [string], cons: [string]};
    var analysis = {
        'pros': [],
        'cons': [],
        'neutral': []
    };

    var gameHistory = game.history({
        verbose: true
    });

    analyzeMaterial(analysis, gameHistory);
    analyzeFiles(analysis, gameHistory);
    analyzeDiagonals(analysis, gameHistory);
    analyzePawnStructure(analysis, gameHistory);

    return analysis;
}

var config = {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    moveSpeed: 400
}
board = Chessboard('myBoard', config);


function defendersOfAll() {
    // FUNCTION FOR TESTING PURPOSES. REMOVE AFTERWARDS
    for (let i = 0; i < 8; i++) {
        var x = "";
        for (let j = 0; j < 8; j++) {
            var z = 'a'.charCodeAt(0) + j;
            z = String.fromCharCode(z);
            // alert(z + (i + 1));
            x += getNumDefenders('w', z + (i + 1)).toString() + " ";
        }
        console.log(x);
    }
}

//DOM INTERACTION

var explainCounter = 0;
var explainLength = 0;

$('#analysis-button').click(function () {
    var fen = game.fen().split(' ').slice(0, 3).join(' ');
    if (promotionOccuring) {
        $('#warning-paragraph').text("Analysis cannot be made during promotion");
    } else if (openingMap[fen]) {
        $('#explanation-paragraph').text("Book Opening: " + openingMap[fen].name);
    } else {
        var analysisObject = analyzePosition();
        $("#explanation-paragraph").text("");

        $('#pros-analysis').empty();
        for (let i = 0; i < analysisObject.pros.length; i++) {
            $('#pros-analysis').append("<li>" + analysisObject.pros[i].statement + "</li>");
        }

        $('#cons-analysis').empty();
        for (let i = 0; i < analysisObject.cons.length; i++) {
            $('#cons-analysis').append(("<li>" + analysisObject.cons[i].statement + "</li>"));
        }

        $('#neutral-analysis').empty();
        for (let i = 0; i < analysisObject.neutral.length; i++) {
            $('#neutral-analysis').append(("<li>" + analysisObject.neutral[i].statement + "</li>"));
        }

        explainLength = analysisObject.pros.length + analysisObject.cons.length + analysisObject.neutral.length;
        if (explainLength > 0) {
            analysisOccuring = true;
            $('#next-button').show();
            $('#analysis-button').hide();
        }

    }

});

$('#next-button').click(function () {
    $('#pros-analysis li').css("background-color", "");
    $('#cons-analysis li').css("background-color", "");
    $('#neutral-analysis li').css("background-color", "");

    setDefaultSquareLighting();

    var analysisObject = analyzePosition();

    if (explainCounter < explainLength) {
        var prosLength = $('#pros-analysis li').length;
        var consLength = $('#cons-analysis li').length;
        var neutralLength = $('#neutral-analysis li').length;

        var index = explainCounter;
        var turnToReplay = 0;

        if (index < prosLength) {
            $('#pros-analysis li').eq(index).css("background-color", "#69140e");
            highlightSquares(analysisObject.pros[index].squares);
            turnToReplay = (analysisObject.pros[index].turn === 'w' ? 2 : 1);
            actionReplay(turnToReplay);
        } else {
            index -= prosLength;
            if (index < consLength) {
                $('#cons-analysis li').eq(index).css("background-color", "#69140e");
                highlightSquares(analysisObject.cons[index].squares);
                turnToReplay = (analysisObject.cons[index].turn === 'w' ? 2 : 1);
                actionReplay(turnToReplay);
            } else {
                index -= consLength;
                if (index < neutralLength) {
                    $('#neutral-analysis li').eq(index).css("background-color", "#69140e");
                    highlightSquares(analysisObject.neutral[index].squares);
                    turnToReplay = (analysisObject.neutral[index].turn === 'w' ? 2 : 1);
                    actionReplay(turnToReplay);
                }
            }
        }
        explainCounter++;

    } else {
        resetButtons();
    }
})