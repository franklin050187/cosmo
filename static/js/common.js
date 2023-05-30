$(document).ready(function () {
    $('#menu-btn').click(function(){
        $(this).toggleClass('open');
    })

    $('#login-btn').click(function(){
        $('#login-form').stop().fadeToggle(250);
    });

    $('html, body').click(function(){
        $('#login-form').stop().fadeOut(250);
    })

    $('#login-btn, #login-form').click(function(e){
        e.stopPropagation();
    });
});