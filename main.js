// Instantiate game model, view model, stockfish ai, and global variables.
var board = null;
var game = new Chess();
var stock = new Worker('./node_modules/stockfish/src/stockfish.js');
var moveList = '';
var openingMap = {};

var initBoardPos = "startpos";

var promotionOccuring = false;

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
            // applyFenString('4k3/p1ppp1pp/8/1p2p3/P2P1P2/8/P1P2PPP/4K3 w - - 0 1');
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
    if (piece.slice(1).toLowerCase() == 'p' && reachedEndOfBoard(target)) {

        console.log(__promotionOption_squares(target));

        var promotionSquares = __promotionOption_squares(target);

        var optionsPosition = {};
        optionsPosition[promotionSquares[0]] = 'wQ';
        optionsPosition[promotionSquares[1]] = 'wN';
        optionsPosition[promotionSquares[2]] = 'wB';
        optionsPosition[promotionSquares[3]] = 'wR';

        board.position(optionsPosition);
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

    console.log("The start diagonal: " + start);
    console.log("The end diagonal: " + end);
    console.log("Matching incremented file: " + matchingIncFile);
    console.log("Matching decrementing file: " + matchingDecFile);
    console.log("Start row: " + start.slice(1));
    console.log("End row: " + end.slice(1));
    console.log("Start + 1 equal to End Strict: " + ((parseInt(start.slice(1)) + 1) === end.slice(1)));
    console.log("Start + 1 equal to End Loose: " + ((parseInt(start.slice(1)) + 1) == end.slice(1)));



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

function __piece_between_two_squares(color, piece, start, end) {
    // CHECK IF A PIECE IS BETWEEN 2 SQUARES. 
    // WORKS ONLY ON DIAGONALS AND FILES
    var startFile = start.slice(0, 1);
    var startRow = parseInt(start.slice(1));

    var endFile = end.slice(0, 1);
    var endRow = parseInt(end.slice(1));

    // SAME FILE
    if (startFile === endFile) {
        // Sanitizing Input so start < end before iteration.
        let temp = startRow;
        startRow = (startRow < endRow) ? startRow : endRow;
        endRow = (startRow === endRow) ? temp : endRow;

        for (let i = startRow; i < endRow + 1; i++) {
            let pieceObject = game.get(startFile + i);
            if (pieceObject && piece === pieceObject.type && color === pieceObject.color) {
                return true;
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
                    return true;
                }
            }
            return false;
        } else {
            for (let i = 0; i < startRow - endRow + 1; i++) {
                let newFile = String.fromCharCode(startFileCode + i);
                let newRow = startRow - i;
                let pieceObject = game.get(newFile + newRow);
                if (pieceObject && pieceObject.type === piece && pieceObject.color === color) {
                    return true;
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
            if (__piece_between_two_squares(color, 'p', newFile + '1', newFile + newRow)) {
                numPawnDefenders++;
            }
        }
    } else {
        for (let i = 0; i < startRow - endRow + 1; i++) {
            let newFile = String.fromCharCode(startFileCode + i);
            let newRow = startRow - i;
            if (__piece_between_two_squares(color, 'p', newFile + '1', newFile + newRow)) {
                numPawnDefenders++;
            }
        }
    }
    console.log("Num Defenders: " + numPawnDefenders);
    return (numPawnDefenders < 4);
}

function reachedEndOfBoard(square) {
    // NEEDS UPDATING IF WANTING TO ALLOW BLACK PLAY
    return (square.slice(1) === '8');
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
        console.log("chess.js failed to load");
    }
    board.position(game.fen());
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


//MY CODE: Board Analysis Functions
function analyzeMaterial(analysis, gHistory) {
    var blackLastMove = gHistory[gHistory.length - 1];
    var whiteLastMove = gHistory[gHistory.length - 2];

    if (blackLastMove.captured) {
        // Need to account for enpassant captures.
        var squareCaptured = (blackLastMove.flags.includes('e') ? __enPassant_change(blackLastMove.to) : blackLastMove.to);

        console.log(`Captured piece: ${blackLastMove.captured} on ${squareCaptured}`);
        var lostPieceCon = `Loss of material: ${__convert_chessLetter_to_fullName(blackLastMove.captured)} on ${squareCaptured}`;
        var materialObject = {
            statement: lostPieceCon,
            squares: [squareCaptured]
        }
        analysis.cons.push(materialObject);

    }

    if (whiteLastMove.captured) {
        // Need to account for enpassant captures.
        var squareCaptured = (whiteLastMove.flags.includes('e') ? __enPassant_change(whiteLastMove.to) : whiteLastMove.to);

        console.log(`Captured piece: ${whiteLastMove.captured} on ${squareCaptured}`);
        var wonPiecePro = `Won material: ${__convert_chessLetter_to_fullName(whiteLastMove.captured)} on ${squareCaptured}`;
        var materialObject = {
            statement: wonPiecePro,
            squares: [squareCaptured]
        }
        analysis.pros.push(materialObject);
    }

    return analysis;
}

function analyzeFiles(analysis, gHistory) {
    var blackLastMove = gHistory[gHistory.length - 1];
    var whiteLastMove = gHistory[gHistory.length - 2];


    if (blackLastMove.captured && blackLastMove.piece === "p") {
        var fileOpened = blackLastMove.from.slice(0, 1);
        var fileStatement = "";

        if (__piece_between_two_squares('w', 'p', fileOpened + '1', fileOpened + '8') && !__piece_between_two_squares('b', 'p', fileOpened + '1', fileOpened + '8')) {
            fileStatement = `Black's pawn capture created a semi-open ${fileOpened} file.`;
        } else if (!__piece_between_two_squares('w', 'p', fileOpened + '1', fileOpened + '8') && __piece_between_two_squares('b', 'p', fileOpened + '1', fileOpened + '8')) {
            fileStatement = `Black's pawn capture created a semi-open ${fileOpened} file.`;
        } else if (!__piece_between_two_squares('w', 'p', fileOpened + '1', fileOpened + '8') && !__piece_between_two_squares('b', 'p', fileOpened + '1', fileOpened + '8')) {
            fileStatement = `Black's pawn capture opened the ${fileOpened} file.`;
        }
        var fileObject = {
            statement: fileStatement,
            squares: getFileSquares(fileOpened)
        }
        analysis.neutral.push(fileObject)
    }

    if (whiteLastMove.captured && whiteLastMove.piece === "p") {
        var fileOpened = whiteLastMove.from.slice(0, 1);
        var fileStatement = "";

        if (__piece_between_two_squares('b', 'p', fileOpened + '1', fileOpened + '8') && !__piece_between_two_squares('w', 'p', fileOpened + '1', fileOpened + '8')) {
            fileStatement = `White's pawn capture created a semi-open ${fileOpened} file.`;
        } else if (!__piece_between_two_squares('b', 'p', fileOpened + '1', fileOpened + '8') && __piece_between_two_squares('w', 'p', fileOpened + '1', fileOpened + '8')) {
            fileStatement = `White's pawn capture created a semi-open ${fileOpened} file.`;
        } else if (!__piece_between_two_squares('b', 'p', fileOpened + '1', fileOpened + '8') && !__piece_between_two_squares('w', 'p', fileOpened + '1', fileOpened + '8')) {
            fileStatement = `White's pawn capture opened the ${fileOpened} file.`;
        }
        var fileObject = {
            statement: fileStatement,
            squares: getFileSquares(fileOpened)
        }
        analysis.neutral.push(fileObject);
    }

    return analysis;
}

function analyzeDiagonals(analysis, gHistory) {
    var blackLastMove = gHistory[gHistory.length - 1];
    var whiteLastMove = gHistory[gHistory.length - 2];

    var startSquare = null;
    var endSquare = null;

    var diagonalObject = {};

    if (blackLastMove.piece === 'p' && getAdjKing('b', blackLastMove.from)) {
        startSquare = getAdjKing('b', blackLastMove.from);
        endSquare = extrapolateDiagonal('b', startSquare, blackLastMove.from);
        if (__diagonal_is_weak('b', startSquare, endSquare)) {
            diagonalObject.statement = `${startSquare} to ${endSquare} diagonal weakened for Black`;
            diagonalObject.squares = getDiagonalSquares(startSquare, endSquare);
            // diagonalObject.squares = ['a1'];
            analysis.pros.push(diagonalObject);
        }

    }
    if (whiteLastMove.piece === 'p' && getAdjKing('w', whiteLastMove.from)) {
        startSquare = getAdjKing('w', whiteLastMove.from);
        endSquare = extrapolateDiagonal('w', startSquare, whiteLastMove.from);
        if (__diagonal_is_weak('w', startSquare, endSquare)) {
            diagonalObject.statement = `${startSquare} to ${endSquare} diagonal weakened for White`;
            diagonalObject.squares = getDiagonalSquares(startSquare, endSquare);
            // diagonalObject.squares = ['a1'];
            analysis.cons.push(diagonalObject);
        }
    }
    return analysis;
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

    analysis = analyzeMaterial(analysis, gameHistory);
    analysis = analyzeFiles(analysis, gameHistory);
    analysis = analyzeDiagonals(analysis, gameHistory);

    return analysis;
}

var config = {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
}
board = Chessboard('myBoard', config);

//DOM INTERACTION

var explainCounter = 0;
var explainLength = 0;

$('#analysis-button').click(function () {
    var fen = game.fen().split(' ').slice(0, 3).join(' ');
    if (openingMap[fen]) {
        $('#explanation-paragraph').text("Book Opening: " + openingMap[fen].name);
    } else {
        var analysisObject = analyzePosition();
        console.log(analysisObject);
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

        if (index < prosLength) {
            $('#pros-analysis li').eq(index).css("background-color", "#69140e");
            highlightSquares(analysisObject.pros[index].squares);
        } else {
            index -= prosLength;
            if (index < consLength) {
                $('#cons-analysis li').eq(index).css("background-color", "#69140e");
                highlightSquares(analysisObject.cons[index].squares);
            } else {
                index -= consLength;
                if (index < neutralLength) {
                    $('#neutral-analysis li').eq(index).css("background-color", "#69140e");
                    highlightSquares(analysisObject.neutral[index].squares);
                }
            }
        }
        explainCounter++;

    } else {
        explainCounter = 0;
        explainLength = 0;
        $('#next-button').hide();
        $('#analysis-button').show();
    }
})