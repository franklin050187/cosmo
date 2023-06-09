$(document).ready(function() {
  $('#elim-competitive-btn').click(function() {
    if (!$(this).hasClass('active')) {
      $('#dom-competitive-btn').removeClass('active');
      $(this).addClass('active');
      $('#elim-competitive-tab').stop().slideDown(250);
      $('#dom-competitive-tab').stop().slideUp(250);

      var $shipList = $("#elim-competitive-ship-list");
      var $ships = $shipList.find(".ship-card");

      $ships.sort(function(a, b) {
        var dateA = new Date($(a).find(".data:contains('Date of submission:')").text().trim().split(" ")[3]).getTime();
        var dateB = new Date($(b).find(".data:contains('Date of submission:')").text().trim().split(" ")[3]).getTime();

        return dateB - dateA;
      });

      $shipList.empty().append($ships);
    }
  });

  // Sort the #elim-competitive-btn ship list by date of submission when the page is initially loaded
  var $shipList = $("#elim-competitive-ship-list");
  var $ships = $shipList.find(".ship-card");

  $ships.sort(function(a, b) {
    var dateA = new Date($(a).find(".data:contains('Date of submission:')").text().trim().split(" ")[3]).getTime();
    var dateB = new Date($(b).find(".data:contains('Date of submission:')").text().trim().split(" ")[3]).getTime();

    return dateB - dateA;
  });

  $shipList.empty().append($ships);

  $('#dom-competitive-btn').click(function() {
    if (!$(this).hasClass('active')) {
      $('#elim-competitive-btn').removeClass('active');
      $(this).addClass('active');
      $('#elim-competitive-tab').stop().slideUp(250);
      $('#dom-competitive-tab').stop().slideDown(250);

      var $shipList = $("#dom-competitive-ship-list");
      var $ships = $shipList.find(".ship-card");

      $ships.sort(function(a, b) {
        var popularityA = parseInt($(a).find(".data:contains('Popularity:')").text().trim().split(" ")[1]);
        var popularityB = parseInt($(b).find(".data:contains('Popularity:')").text().trim().split(" ")[1]);

        return popularityB - popularityA;
      });

      $shipList.empty().append($ships);
    }
  });
});
