// NOTE: this example uses the chess.js library:
// https://github.com/jhlywa/chess.js


var board = null;
var game = new Chess();

var stock = new Worker('./node_modules/stockfish/src/stockfish.js');
var moveList = '';

//Different onmessage behavior depending if stockfish 
// has been set up or not.
var NEW_GAME_STARTED = false;

stock.onmessage = function (e) {
    console.log(e.data);
    var response = e.data.split(' ');
    switch (response[0]) {
        case 'uciok':
            stock.postMessage('setoption name Hash value 32');
            stock.postMessage('isready');
            break;

        case 'readyok':
            NEW_GAME_STARTED = true;
            stock.postMessage('ucinewgame');
            break;

        case 'bestmove':
            console.log('Best Move is:');
            console.log(response[1]);
            moveList += ' ' + response[1];
            console.log("New Movelist: " + moveList);
            break;

        default:
            console.log("Default Reached");
    }

}
stock.postMessage('uci');

function onDragStart(source, piece, position, orientation) {
    // do not pick up pieces if the game is over
    if (game.game_over()) return false

    // only pick up pieces for White
    if (piece.search(/^b/) !== -1) return false
}

function makeRandomMove() {
    var possibleMoves = game.moves()

    // game over
    if (possibleMoves.length === 0) return

    var randomIdx = Math.floor(Math.random() * possibleMoves.length)
    game.move(possibleMoves[randomIdx])
    board.position(game.fen())
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

    // make random legal move for black
    window.setTimeout(makeRandomMove, 250)
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

    moveList += ' ';
    moveList += startPos;
    moveList += endPos;

    console.log("After player move: " + moveList);
    stock.postMessage('position startpos moves' + moveList);
    stock.postMessage('go movetime 1000');
}


var config = {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
}
board = Chessboard('myBoard', config);