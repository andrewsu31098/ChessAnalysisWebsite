//DOM INTERACTIONA
var explainCounter = 0;
var explainLength = 0;

$("#analysis-button").click(function () {
  var fen = game.fen().split(" ").slice(0, 3).join(" ");
  if (promotionOccuring) {
    $("#warning-paragraph").text("Analysis cannot be made during promotion");
  } else if (openingMap[fen]) {
    $(".explanation-paragraph")
      .first()
      .text("Book Opening: " + openingMap[fen].name);
  } else if (moveList === "") {
    $(".explanation-paragraph").empty();
    $(".explanation-paragraph")
      .first()
      .text("Play a move first to have Chess Explainer analyze it.");
  } else {
    var analysisObject = analyzePosition();
    console.log(analysisObject);
    $(".explanation-paragraph").empty();

    $("#pros-analysis").empty();
    for (let i = 0; i < analysisObject.pros.length; i++) {
      $("#pros-analysis").append(
        "<li>" + analysisObject.pros[i].statement + "</li>"
      );
    }

    $("#cons-analysis").empty();
    for (let i = 0; i < analysisObject.cons.length; i++) {
      $("#cons-analysis").append(
        "<li>" + analysisObject.cons[i].statement + "</li>"
      );
    }

    $("#neutral-analysis").empty();
    for (let i = 0; i < analysisObject.neutral.length; i++) {
      $("#neutral-analysis").append(
        "<li>" + analysisObject.neutral[i].statement + "</li>"
      );
    }

    explainLength =
      analysisObject.pros.length +
      analysisObject.cons.length +
      analysisObject.neutral.length;
    if (explainLength > 0) {
      analysisOccuring = true;
      $("#next-button").show();
      $("#analysis-button").hide();
    }
  }
});

$("#next-button").click(function () {
  $("#pros-analysis li").css("background-color", "");
  $("#cons-analysis li").css("background-color", "");
  $("#neutral-analysis li").css("background-color", "");

  setDefaultSquareLighting();

  var analysisObject = analyzePosition();

  if (explainCounter < explainLength) {
    var prosLength = $("#pros-analysis li").length;
    var consLength = $("#cons-analysis li").length;
    var neutralLength = $("#neutral-analysis li").length;

    var index = explainCounter;
    var turnToReplay = 0;

    if (index < prosLength) {
      $("#pros-analysis li").eq(index).css("background-color", "#69140e");
      highlightSquares(analysisObject.pros[index].squares);
      turnToReplay = analysisObject.pros[index].turn === "w" ? 2 : 1;
      actionReplay(turnToReplay);
    } else {
      index -= prosLength;
      if (index < consLength) {
        $("#cons-analysis li").eq(index).css("background-color", "#69140e");
        highlightSquares(analysisObject.cons[index].squares);
        turnToReplay = analysisObject.cons[index].turn === "w" ? 2 : 1;
        actionReplay(turnToReplay);
      } else {
        index -= consLength;
        if (index < neutralLength) {
          $("#neutral-analysis li")
            .eq(index)
            .css("background-color", "#69140e");
          highlightSquares(analysisObject.neutral[index].squares);
          turnToReplay = analysisObject.neutral[index].turn === "w" ? 2 : 1;
          actionReplay(turnToReplay);
        }
      }
    }
    explainCounter++;
  } else {
    resetButtons();
  }
});
