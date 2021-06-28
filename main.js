// Instantiate game model, view model, stockfish ai, and global variables.
var board = null;
var game = new Chess();
var stock = new Worker('./node_modules/stockfish/src/stockfish.js');
var moveList = '';
var openingMap = {};

var initBoardPos = "startpos";

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
            applyFenString('7k/PPP5/8/8/8/8/8/K7 w - - 0 10');
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
stock.postMessage('uci');


// UI EVENT HANDLERS
function onDragStart(source, piece, position, orientation) {
    // do not pick up pieces if the game is over
    if (game.game_over()) return false

    // only pick up pieces for White
    if (piece.search(/^b/) !== -1) return false
}

function onDrop(source, target) {
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
function onSnapEnd() {
    board.position(game.fen())

    //Retrieve Last seen move to send to stockfish worker.
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