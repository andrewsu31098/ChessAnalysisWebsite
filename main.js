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
            applyFenString('7k/1P1P1P2/1P1P1P2/8/8/8/8/K7 w - - 0 1');
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


        alert("Hello");
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

function reachedEndOfBoard(square) {
    return (square.slice(1) == '8');
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



//MY CODE: Board Analysis Functions
function analyzeMaterial(analysis, gHistory) {
    var lastMove = gHistory[gHistory.length - 1];

    console.log(lastMove);
    if (lastMove.captured) {
        // Need to account for enpassant captures.
        var squareCaptured = (lastMove.flags.includes('e') ? __enPassant_change(lastMove.to) : lastMove.to);

        console.log(`Captured piece: ${lastMove.captured} on ${squareCaptured}`);
        var lostPieceCon = `Loss of material: ${__convert_chessLetter_to_fullName(lastMove.captured)} on ${squareCaptured}`;
        analysis.cons.push(lostPieceCon);
    }
    return analysis;
}

function analyzePosition() {
    // Return analysis object. {pros: [string], cons: [string]};
    var analysis = {
        'pros': [],
        'cons': []
    };

    var gameHistory = game.history({
        verbose: true
    });

    analysis = analyzeMaterial(analysis, gameHistory);

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

// $('.white-1e1d7').css("background-color", "pink");

//DOM INTERACTION
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
            $('#pros-analysis').append("<li>" + analysisObject.pros[i] + "<\li>");
        }
        $('#cons-analysis').empty();
        for (let i = 0; i < analysisObject.cons.length; i++) {
            $('#cons-analysis').append("<li>" + analysisObject.cons[i] + "<\li>");
        }
    }
    console.log(fen);
})