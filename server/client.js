var username = "guest";
var scrollback = 10000 * 17; // scrollback lines * line height guess (revise later)

var videoDivs = [];
var backCanvases = [];
var broadcasting = false;
var users = {};
var history = [];

//var PeerConnection = window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection;

var websocketChat = {
    send: function (message) {
        rtc._socket.send(message);
    },
    recv: function (message) {
        return message;
    },
    event: 'receive_chat_msg'
};

/*
var dataChannelChat = {
    send: function (message) {
        for (var connection in rtc.dataChannels) {
            var channel = rtc.dataChannels[connection];
            channel.send(message);
        }
    },
    recv:  function (channel, message) {
        return JSON.parse(message).data;
    },
    event: 'data stream data'
};
*/

function sanitize(msg) {
    if (msg)
        return $("<div>").text(msg).html();
    else
        return msg;
}

function getUsernameFromId(id) {
    if (id === 'you')
        return username
    else if (id.slice(0,6) === "remote")
        id = id.slice(6);
    for (un in users) {
        if (users[un].socketId === id)
            return un;
    }
    return "<unknown>";
}

function randomColor() {
    do {
        var red = ((1<<8)*Math.random()|0);
        var green = ((1<<8)*Math.random()|0);
        var blue = ((1<<8)*Math.random()|0);
        var intensity = 0.299 * red + 0.587 * green + 0.114 * blue;
        var minDistance = (1<<8);
        for (un in users) {
            minDistance = Math.min(minDistance, Math.max(Math.abs(red-users[un].r), Math.abs(green-users[un].g), Math.abs(blue-users[un].b)));
        }
    } while (intensity > 96 || (minDistance < 32 && tries < 20));
    var hex = ((red<<16)+(green<<8)+blue).toString(16);
    if (hex.length < 6)
        hex = '#0'+hex;
    else
        hex = '#'+hex;
    return {'r': red, 'g': green, 'b': blue, 'hex': hex};
}

function resizeElements() {
    //$("#messageBox").width($("#chat").width() - $("#messageSubmit").outerWidth() - 6);
    if (videoDivs.length > 0) {
        var maxPaneHeight = Math.max(240, Math.round($(window).height()/2.5));
        var paneHeight = maxPaneHeight;
        $("#videoPane").height(maxPaneHeight);
        if (!$('#videoPane').is(':visible')) {
            $("#videoPane").slideDown(400, function () {
                resizeElements();
                scrollDown($('#chatbox'), true);
            });
        }
        else {
            var paneWidth = $('#videoPane').innerWidth();
            // assume
            var aspectRatio = 1.333;
            var videoWidth = Math.round(paneHeight*aspectRatio);
            var rows = 1;
            while (videoWidth * Math.ceil(videoDivs.length/rows) > paneWidth) {
                rows++;
                videoWidth = Math.round((paneHeight/rows)*aspectRatio);
            }
            console.log(videoDivs.length+" videos, width="+videoWidth);
            console.log("   in "+rows+" rows.");
            var videoHeight = Math.floor(maxPaneHeight/rows);
            videoWidth = Math.round(videoHeight * aspectRatio);
            console.log("Changed videoHeight="+videoHeight+", videoWidth="+videoWidth);
            if (rows > 1) {
                var newVideoWidth = Math.floor(paneWidth/Math.ceil(videoDivs.length/(rows-1)));
                var newVideoHeight = Math.round(newVideoWidth/aspectRatio);
                if (newVideoHeight > videoHeight) {
                    videoHeight = newVideoHeight;
                    videoWidth = newVideoWidth;
                    rows--;
                }
                console.log("Reverted to 1 row, videoHeight="+videoHeight+", videoWidth="+videoWidth);
                paneHeight = Math.round(videoHeight*rows);
            }
            
            $('#videoPane').height(paneHeight)
            for (var i=0; i<videoDivs.length; i++) {
                videoDivs[i].height(videoHeight);
                videoDivs[i].children('video, canvas').height(videoHeight);
                videoDivs[i].children('video, canvas').attr('height', videoHeight);
                videoDivs[i].width(videoWidth);
                videoDivs[i].children('video, canvas').width(videoWidth);
                videoDivs[i].children('video, canvas').attr('width', videoWidth);
                if (!videoDivs[i].is(':visible')) {
                    var fadedDiv = videoDivs[i];
                    fadedDiv.fadeIn(200, function() {
                        drawVideoOverlay(fadedDiv);
                    });
                }
                else
                    drawVideoOverlay(videoDivs[i]);
            }
        }
    }
    else if ($('#videoPane').is(':visible'))
        $("#videoPane").slideUp(400, function () {
            $("#chatbox").height($(window).height() - $("#chatbox").position().top - parseInt($("#chatbox").css('margin-bottom')) - $("#messageBox").height() - 48);
            scrollDown($('#chatbox'), true);
            $('#userlist').height($('#chatbox').height());
        });
    
    $('#chatbox').height($(window).height() - $("#chatbox").position().top - parseInt($("#chatbox").css('margin-bottom')) - $("#messageBox").height() - 48);
    $('#userlist').height($('#chatbox').height());
}

function drawVideoOverlay(div) {
    var context = div.children('canvas').get()[0].getContext("2d");
    context.strokeStyle = "#ffffff";
    context.font = '16px Courier';
    context.textBaseline = 'top';
    context.strokeText(getUsernameFromId(div.attr('id')), 5, 2);
    //console.log("Drew overlay.");
}

function createVideoBlock(id, stream) {
    var div = $('<div></div>');
    div.attr('id', id);
    div.attr('class', 'videoBlock');
    div.hide();
    var video = $('<video></video>');
    video.css('position', 'absolute');
    video.offset({top: 0, left: 0});
    var canvas = $('<canvas></canvas>');
    canvas.css('position', 'absolute');
    canvas.offset({top: 0, left: 0});
    div.append(video);
    div.append(canvas);
    $('#videoPane').append(div);
    videoDivs.push(div);
    attachStream(stream, video[0]);
    createVideoMenu(div);
    /*
    div.mousedown(function(event) {
        if (event.which === 3) { // Right-click
            video.trigger({
                type: 'mousedown',
                which: 3
            });
        }
    });
    div.mouseup(function(event) {
        if (event.which === 3) {
            video.trigger({
                type: 'mouseup',
                which: 3
            });
        }
    });
    */
    return div;
}

function createVideoMenu(div) {
    var canvas = div.children('canvas');
    div.mouseenter(function(event) {
        console.log("mouse in");
        var canvas = div.children('canvas').get()[0];
        var buttonLoc = {top: canvas.height-25, left: canvas.width-25, width: 20, height: 20};
        console.log(canvas);
        var context = canvas.getContext("2d");
        context.fillStyle = '#fff';
        context.fillRect(buttonLoc.left, buttonLoc.top, buttonLoc.width, buttonLoc.height);
    });
    div.mouseleave(function(event) {
        console.log("mouseout");
        var canvas = div.children('canvas').get()[0];
        var buttonLoc = {top: canvas.height-25, left: canvas.width-25, width: 20, height: 20};
        var context = canvas.getContext("2d");
        context.clearRect(buttonLoc.left, buttonLoc.top, buttonLoc.width, buttonLoc.height);
        console.log(buttonLoc.top+", "+buttonLoc.left); 
    });
    div.mousemove(function(event) {
        var canvas = div.children('canvas').get()[0];
        var buttonLoc = {top: canvas.height-25, left: canvas.width-25, width: 20, height: 20};
        var x = event.pageX - $(canvas).offset().left;
        var y = event.pageY - $(canvas).offset().top;
        //console.log("mousemove ("+x+","+y+")");
        //console.log(buttonLoc);
        if (x > buttonLoc.left && x < buttonLoc.left+buttonLoc.width &&
            y > buttonLoc.top && y < buttonLoc.top+buttonLoc.height)
                createContextMenu(div, x, y);
    });
}

function createContextMenu(div, x, y) {
    if (div.children('.contextMenu').length === 0) {
        console.log("Creating context menu.");
        var menu = $('.contextMenu').clone();
        menu.offset({left: x, top: y});
        menu.attr('name', div.attr('id'));
        div.append(menu);
        //menu.slideDown(150);
        menu.show();
        console.log(div);
    }
}

function attachStream(stream, element) {
    if (stream)
        element.src = URL.createObjectURL(stream);
}

function removeVideo(id) {
    var div = $('#'+id);
    if (div) {
        div.fadeOut(200, function() {
            var video = div.children('video');
            video[0].src = null;
            videoDivs.splice(videoDivs.indexOf(div), 1);
            video.remove();
            resizeElements();
        });
    }
}

function scrollDown(field, force) {
    if ((typeof force !== "undefined" && force) || (field.scrollTop() >= field[0].scrollHeight - field.height() - 56)) {
        field.scrollTop(scrollback);
        if (field.scrollTop() === scrollback) {
            field.remove($(field.selector+' .chatmsg:first,br:first'));
            field.scrollTop(scrollback);
        }
    }
}

function broadcast() {
    broadcasting = !broadcasting;
    if (broadcasting) {
        $("#broadcastButton").html("Stop Broadcasting");
        rtc.createStream({"video": true, "audio": true}, function(stream) {
            console.log("Broadcasting...");
            var div = createVideoBlock('you', stream);
            var video = div.children('video')
            video.attr('class', 'flip');
            console.log(video[0]);
            resizeElements();
            video[0].play();
            rtc.addStreams();
            rtc.sendOffers();
        }, function(stream) {
            //rtc.fire('ready');
            console.log("createStream failed.");
            if (stream)
                stream.stop();
        });
    }
    else {
        $("#broadcastButton").html("Start Broadcasting");
        removeVideo("you");
        for (var i = 0; i < rtc.streams.length; i++) {
            var stream = rtc.streams[i];
            console.log('Removing stream.');
            console.log(stream);
            for (var connection in rtc.peerConnections) {
                rtc.peerConnections[connection].removeStream(stream);
                rtc.sendOffer(connection);
            }
            stream.stop();
            console.log(stream);
        }
        rtc.streams = [];
        rtc.initializedStreams--;
        rtc.numStreams--;
        resizeElements();
    }
}

function addToChat(type, username, msg, color) {
    var messages = $('#chatbox');
    if (msg)
        msg = sanitize(msg);
    switch (type) {
        case 'join':
            msg = '<strong class="chatmsg">' + username + ' has joined the chat.</strong>';
            break;
        case 'color':
            msg = '<strong class="chatmsg" style="color: ' + color + ';">Your color has been changed.</strong>';
            break;
        case 'nick':
            msg = '<strong class="chatmsg">' + username + ' is now known as ' + msg + '</strong>';
            break;
        case 'pubmsg':
            var lastEmote = 0;
            do {
                var start = msg.indexOf('*', lastEmote);
                var end = msg.indexOf('*', start+1);
                if (end > lastEmote) {
                    msg = msg.slice(0, start) + "<em>" + msg.slice(start, end+1) + "</em>" + msg.slice(end+1);
                    lastEmote = end+5;
                }
                console.log(start, end);
            } while (start > -1 && end > -1);
            msg = '<span class="chatmsg" style="color: ' + color + ';">' + username + ': ' + msg + '</span>';
            break;
        case 'pubemote':
            msg = '<span class="chatmsg" style="color: ' + color + ';">*' + username + " " + msg + '</span>';
            break;
        case 'quit':
            msg = '<strong class="chatmsg">' + username + ' has quit.</strong>';
            break;
    }
    $(messages.selector+' p').append($(msg + '<br>'));
    scrollDown(messages);
}

function rewriteUserlist() {
    $('#userlist').html("<ul></ul>");
    var userlist = $('#userlist ul');
    for (un in users) {
        userlist.append("<li>"+un+"</li>")
    }
}

function initChat() {
    var chat;

    console.log('initializing websocket chat');
    chat = websocketChat;

    var input = $('#messageBox');
    var room = window.location.pathname.slice(1);
    var color = randomColor();

    input.keydown(function (event) {
        var key = event.which || event.keyCode;
        if (key === 13 && input.val().trim() !== "") {
            if (input.val().trim() == "/color") {
                color = randomColor();
                chat.send(JSON.stringify({
                    "eventName": "chat_msg",
                    "data": {
                        "type": "color",
                        "username": username,
                        "room": room,
                        "color": color
                    }
                }));
                users[username].color = color;
                addToChat("color", "", "", color.hex);
            }
            else if (input.val().slice(0, 6) === "/nick ") {
                var newUsername = input.val().slice(6).trim();
                chat.send(JSON.stringify({
                    "eventName": "chat_msg",
                    "data": {
                        "type": "nick",
                        "messages": newUsername,
                        "username": username,
                        "room": room,
                        "color": color
                    }
                }));
                addToChat("nick", username, newUsername, color.hex);
                users[newUsername] = users[username];
                delete users[username];
                //console.log(users);
                username = newUsername;
                rewriteUserlist();
            }
            else if (input.val().slice(0, 4) === "/me ") {
                chat.send(JSON.stringify({
                    "eventName": "chat_msg",
                    "data": {
                        "type": "pubemote",
                        "messages": input.val().slice(4),
                        "username": username,
                        "room": room,
                        "color": color
                    }
                }));
                addToChat("pubemote", username, input.val().slice(4), color.hex);
            }
            else {
                chat.send(JSON.stringify({
                    "eventName": "chat_msg",
                    "data": {
                        "type": "pubmsg",
                        "messages": input.val(),
                        "username": username,
                        "room": room,
                        "color": color
                    }
                }));
                addToChat("pubmsg", username, input.val(), color.hex);
            }
            history[Math.max(0, history.length-1)] = input.val();
            historyPosition = history.length;
            history.push("");
            input.val("");
        }
        else if (key === 38) { // Up arrow
            if (historyPosition > 0) {
                if (historyPosition === history.length-1)
                    history[history.length-1] = input.val();
                else if (input.val() !== history[historyPosition]) {
                    if (history[history.length-1] === "")
                        history[history.length-1] = input.val();
                    else
                    history.push(input.val());
                }
                historyPosition--;
                input.val(history[historyPosition]);
            }
        }
        else if (key === 40) { // Down arrow
            if (historyPosition < history.length-1) {
                if (input.val() !== history[historyPosition]) {
                    if (history[history.length-1] === "")
                        history[history.length-1] = input.val();
                    else
                        history.push(input.val());
                }
                historyPosition++;
                input.val(history[historyPosition]);
            }
        }
    });
    rtc.on(chat.event, function () {
        console.log("Got chat");
        var data = chat.recv.apply(this, arguments);
        //console.log(data.color);
        switch (data.type) {
            case 'join':
                addToChat(data.type, data.username);
                users[data.username] = {'socketId': data.messages, 'color': data.color};
                rewriteUserlist();
                break;
            case 'color':
                console.log(username);
                users[data.username].color = data.color;
                break;
            case 'nick':
                addToChat(data.type, data.username, data.messages, data.color.hex);
                users[data.messages] = users[data.username];
                delete users[data.username];
                rewriteUserlist();
                break;
            case 'pubmsg':
                addToChat(data.type, data.username, data.messages, data.color.hex);
                break;
            case 'pubemote':
                addToChat(data.type, data.username, data.messages, data.color.hex);
                break;
        }
    });

    setTimeout(function () {
        chat.send(JSON.stringify({
            "eventName": "chat_msg",
            "data": {
                "type": "join",
                "messages": rtc._me,
                "username": username,
                "room": room,
                "color": color
            }
        }));
    }, 300);
    setTimeout(function () {
        addToChat("join", username);
    }, 500);
    
    users[username].color = color;
    rewriteUserlist();
}

function init() {
    if (!PeerConnection) {
        alert("Your browser is not supported or you must turn on flags. Go to chrome://flags and turn on Enable PeerConnection, then restart Chrome.");
    }

    var room = window.location.pathname.slice(1);
    rtc.connect("ws://" + window.location.host, room);

    rtc.on('add remote stream', function (stream, socketId) {
        console.log("Adding remote stream...");
        var div = createVideoBlock('remote'+socketId, stream);
        resizeElements();
        div.children('video')[0].play();
    });
    rtc.on("disconnect stream", function (socketId) {
        console.log("Removing "+socketId);
        removeVideo("remote"+socketId);
        //rtc.sendOffer(socketId);
        resizeElements();
    });
    rtc.on("remove_peer_connected", function (data) {
        for (un in users) {
            if (users[un].socketId === data.socketId) {
                addToChat('quit', un);
                delete users[un];
                rewriteUserlist();
            }
        }
    });
    
    users[username] = {}

    //console.log(rtc.initializedStreams +' ' + rtc.numStreams);
    console.log(rtc.connections);
    setTimeout(function () {
        rtc.fire('ready');
        users[username].socketId = rtc._me;
    }, 500);
    //broadcast();
    //$("#video").show();
}

function do_login() {
    username = $('#usernameField').val().trim();
    if (username == "")
        return false;

    $('#loginFrame').fadeOut(400);
    $('#chatFrame').fadeIn(400)
    $('#messageBox').attr('autofocus', '');
    resizeElements();
    init();
    initChat();
    return false;
}

window.onresize = function (event) {
    resizeElements();
}

$('#usernameField').keypress(function (event) {
    var key = event.which || event.keyCode;
    if (key === 13 && $('#usernameField').val() !== "")
        do_login()
});

$('#submitLogin').click(function (event) {
    if ($('#usernameField').val() !== "")
        do_login()
});

$('#broadcastButton').click(broadcast);


function addTestVideo() {
    var div = createVideoBlock(((1<<24)*Math.random()|0).toString(16));
    var c = randomColor();
    //console.log(c)
    div.children('video').css('background-color', c.hex);
    resizeElements();
}
