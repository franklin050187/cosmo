$(document).ready(function () {
    $('#elim-competitive-btn').click(function () {
        if (!$(this).hasClass('active')) {
            $('#dom-competitive-btn').removeClass('active');
            $(this).addClass('active');
            $('#elim-competitive-tab').stop().slideDown(250);
            $('#dom-competitive-tab').stop().slideUp(250);
        }
    });
    $('#dom-competitive-btn').click(function () {
        if (!$(this).hasClass('active')) {
            $('#elim-competitive-btn').removeClass('active');
            $(this).addClass('active');
            $('#dom-competitive-tab').stop().slideDown(250);
            $('#elim-competitive-tab').stop().slideUp(250);
        }
    });
});
