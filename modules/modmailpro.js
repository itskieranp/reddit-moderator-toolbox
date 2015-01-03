function modmailpro() {
//Setup
var self = new TB.Module('Mod Mail Pro');
self.shortname = 'ModMail';

////Default settings
self.settings['enabled']['default'] = true;
self.config['betamode'] = false;

self.register_setting('inboxStyle', {
    'type': 'selector',
    'values': ['All', 'Priority', 'Filtered', 'Replied', 'Unread', 'Unanswered'],
    'default': 'priority',
    'title': 'Default inbox view'
});

self.register_setting('filteredSubs', {
    'type': 'sublist',
    'default': [],
    'title': 'Subreddits to filter from priority view.'
});

self.register_setting('defaultCollapse', {
    'type': 'boolean',
    'default': false,
    'title': 'Collapse all mod mail threads by default.'
});

self.register_setting('noRedModmail', {
    'type': 'boolean',
    'default': true,
    'title': 'Show removed threads with red titles.'
});

self.register_setting('highlightNew', {
    'type': 'boolean',
    'default': true,
    'title': 'Highlight new threads and replies.'
});

self.register_setting('expandReplies', {
    'type': 'boolean',
    'default': false,
    'title': 'Expand all replies when expanding threads.'
});

self.register_setting('hideInviteSpam', {
    'type': 'boolean',
    'default': false,
    'title': 'Filter mod invited and added threads.'
});

self.register_setting('autoLoad', {
    'type': 'boolean',
    'default': false,
    'hidden': !TB.storage.getSetting('Notifier', 'enabled', true),
    'title': 'Automatically load new mod mail when received.'
});

self.register_setting('autoThread', {
    'type': 'boolean',
    'default': false,
    'title': 'Automatically thread replies when expanding. (Note: slows expanding time)'
});

self.register_setting('autoThreadOnLoad', {
    'type': 'boolean',
    'default': false,
    'title': 'Automatically thread replies on page load. (Note: slows page load time)'
});

self.register_setting('fadeRecipient', {
    'type': 'boolean',
    'default': true,
    'title': 'Fade the recipient of a modmail so it is much more clear who sent it.'
});

self.register_setting('subredditColor', {
    'type': 'boolean',
    'default': false,
    'title': 'Add a left border to modmail conversations with a color unique to the subreddit name.'
});

self.register_setting('subredditColorSalt', {
    'type': 'text',
    'default': "PJSalt",
    'title': 'Text to randomly change the subreddit color',
    'hidden': !self.setting('subredditColor')
});

self.register_setting('customLimit', {
    'type': 'number',
    'default': 0, // 0 = ueser's default.
    'title': 'Set the amount of modmail conversations loaded by default. Selecting 0 will use your reddit settings'
});


/// Private setting storage
self.register_setting('lastVisited', {
    'type': 'number',
    'default': new Date().getTime(),
    'hidden': true
});
self.register_setting('replied', {
    'type': 'array',
    'default': [],
    'hidden': true
});
self.register_setting('threadProcessRate', {
    'type': 'number',
    'default': 100,
    'hidden': true
});
self.register_setting('entryProcessRate', {
    'type': 'number',
    'default': 50,
    'hidden': true
});
self.register_setting('chunkProcessSize', {
    'type': 'number',
    'default': 2,
    'hidden': true
});

self.init = function () {
    if (!TBUtils.isModmail) return;

    this.modmailpro();
    this.realtimemail();
    this.mailDropDorpDowns();
};

self.modmailpro = function () {
    var start = performance.now();

    var $body = $('body');

    var ALL = 'all', PRIORITY = 'priority', FILTERED = 'filtered', REPLIED = 'replied', UNREAD = 'unread', UNANSWERED = 'unanswered';
    
    self.startProfile('settings-access');
    var INVITE = "moderator invited",
        ADDED = "moderator added",
        inbox = self.setting('inboxStyle'),
        now = new Date().getTime(),
        lastVisited = self.setting('lastVisited'),
        newCount = 0,
        collapsed = self.setting('defaultCollapse'),
        expandReplies = self.setting('expandReplies'),
        noRedModmail = self.setting('noRedModmail'),
        hideInviteSpam = self.setting('hideInviteSpam'),
        highlightNew = self.setting('highlightNew'),
        fadeRecipient = self.setting('fadeRecipient'),
        subredditColor = self.setting('subredditColor'),
        subredditColorSalt = self.setting('subredditColorSalt'),
        threadProcessRate = self.setting('threadProcessRate'),
        entryProcessRate = self.setting('entryProcessRate'),
        chunkProcessSize = self.setting('chunkProcessSize'),
        unreadPage = location.pathname.match(/\/moderator\/(?:unread)\/?/), //TBUtils.isUnreadPage doesn't wok for this.  Needs or for moderator/messages.
        moreCommentThreads = [],
        unreadThreads = [],
        unansweredThreads = [],
        threadAlways = self.setting('autoThreadOnLoad'),
        threadOnExpand = threadAlways || self.setting('autoThread'),
        sentFromMMP = false,
        lmcSupport = false;
    self.endProfile('settings-access');

    self.startProfile('common-element-gen');
    var separator = '<span class="separator">|</span>',
        spacer = '<span>&nbsp;&nbsp;&nbsp;&nbsp;</span>',
        $allLink = $('<li><a class="alllink" href="javascript:;" view="' + ALL + '">all</a></li>'),
        $priorityLink = $('<li><a class="prioritylink" href="javascript:;" view="' + PRIORITY + '">priority</a></li>'),
        $filteredLink = $('<li><a class="filteredlink" href="javascript:;" view="' + FILTERED + '">filtered</a></li>'),
        $repliedLink = $('<li><a class="repliedlink" href="javascript:;" view="' + REPLIED + '">replied</a></li>'),
        $unreadLink = $('<li><a class="unreadlink" href="javascript:;" view="' + UNREAD + '">unread</a></li>'),
        $unansweredLink = $('<li><a class="unansweredlink" href="javascript:;" view="' + UNANSWERED + '">unanswered</a></li>'),
        $collapseLink = $('<li><a class="collapse-all-link" href="javascript:;">collapse all</a></li>'),
        $unreadCount = $('<li><span class="unread-count"><b>0</b> - new messages</span></li>'),
        $mmpMenu = $('<ul class="flat-list hover mmp-menu"></ul>');
    
    var infoArea =
        '<span class="info-area correspondent">\
            <a style="color:orangered" href="javascript:;" class="filter-sub-link" title="Filter/unfilter thread subreddit."></a>&nbsp;\
            <span class="tb-message-count"></span><span class="replied-tag"></span>\
        </span>';

    var collapseLink = '<a href="javascript:;" class="collapse-link">[−]</a>';
    
    //TODO: move to CSS
    var selectedCSS = {
        "color": "orangered",
        "font-weight": "bold"
    };
    var unselectedCSS = {
        "color": "#369",
        "font-weight": "normal"
    };
    
    self.endProfile('common-element-gen');

    // Find and clear menu list.
    self.startProfile('menu-gen');
    var $menuList = $('.menuarea ul.flat-list').html('');

    // Add menu items.
    $menuList.append($allLink);
    $menuList.append($priorityLink.prepend(separator));
    $menuList.append($filteredLink.prepend(separator));
    $menuList.append($repliedLink.prepend(separator));
    $menuList.append($unreadLink.prepend(separator));
    $menuList.append($unansweredLink.prepend(separator));
    $menuList.append($collapseLink.prepend(spacer));

    $mmpMenu.append($unreadCount.prepend(spacer));

    $menuList.after($mmpMenu);
    self.endProfile('menu-gen');

    self.startProfile('initialize');
    initialize();
    
    // Processing functions
    
    function initialize() {
        self.log('MMP init');
        
        TB.ui.longLoadNonPersistent(true);
        
        // Enable as much CSS can be done at this point
        enablePureCSSFeatures();
        
        // Collapse everything if enabled
        if (collapsed) {
            $body.find('.entry').css('display', 'none');
            $body.find('.expand-btn').css('display', 'none');
        }

        // Process threads
        var $unprocessedThreads = $('.message-parent:not(.mmp-processed)'),
            processSlowly = $unprocessedThreads.slice(0, 8),
            processFastly = $unprocessedThreads.slice(8);
        self.log('Unprocessed Threads = ' + $unprocessedThreads.length);
        self.log('\tProcessing slow = ' + processSlowly.length);
        self.log('\tProcessing fast = ' + processFastly.length);

        self.startProfile('add-ui-unprocessed');
        $unprocessedThreads.find('.correspondent:first').after(infoArea);
        $unprocessedThreads.find('.correspondent.reddit.rounded a:parent').prepend(collapseLink);
        self.endProfile('add-ui-unprocessed');
        
        // Start process
        processThreads(processSlowly, 2, threadProcessRate, slowComplete, "slow");
        //processThreads(unprocessedThreads, chunkProcessSize, threadProcessRate, fastComplete, "full");
        
        function processThreads(threads, chunkSize, processRate, completeAction, profileKey) {
            TBUtils.forEachChunked(threads, chunkSize, processRate,
                function (thread, count, array) {
                    self.log('Running thread batch: ' + (count + 1) + ' of ' + array.length);
                    self.log('\tUser = ' + TB.utils.getThingInfo(thread).user);
                    processThread(thread);
                },
                function complete() {
                    self.endProfile('batch-process-' + profileKey);
                    self.log('Batch ' + profileKey + ' complete');
                    
                    completeAction();
                },
                function start() {
                    self.startProfile('batch-process-' + profileKey);
                });
        }
        
        function slowComplete() {
            processThreads(processFastly, chunkProcessSize, threadProcessRate/2, fastComplete, "fast");
        }
        
        function fastComplete() {
            self.setting('lastVisited', now);

            if (highlightNew) {
                highlightNewThreads($unprocessedThreads);
            }

            // If set expand link.
            if (collapsed) {
                var $link = $('.collapse-all-link');
                $link.css(selectedCSS);
                $link.text('expand all');
            }

            // If we're on the unread page, don't filter anything.
            if (unreadPage) {
                var entries = $('.entry'),
                    newCount = entries.length;
                inbox = ALL;
                $menuList.html('<a href="/message/moderator/">go to full mod mail</a>');
                $('.unread-count').html('<b>' + newCount + '</b> - new mod mail thread' + (newCount == 1 ? '' : 's'));
                $(entries).click();
            }

            // Set views.
            setFilterLinks($unprocessedThreads);
            setReplied($unprocessedThreads);
            setView();

            //finally, add LMC support
            addLmcSupport();

            TB.ui.longLoadNonPersistent(false);

            // Because realtime or LMC may have pulled more threads during init.
            if ($('.message-parent:not(.mmp-processed)').length > 0) {
                initialize();
            }
            // Mod mail done loading
            else {
                finalize();
            }
        }
    }

    function enablePureCSSFeatures() {
        if (noRedModmail) {
            $body.addClass('tb-no-red-modmail');
        }
    }
    
    function enableCSSFeatures() {
        $body.addClass('tb-modmail-pro');
        if (fadeRecipient) {
            $body.addClass('tb-fade-recipient');
        }
    }
    
    function processThread(thread) {
        var $thread = $(thread);
        if ($thread.hasClass('mmp-processed')) {
            return;
        }
        $thread.addClass('mmp-processed');

        var threadStart = performance.now();
        self.startProfile("thread");
        self.startProfile("thread-info");
        self.startProfile("thread-jquery");

        var $infoArea = $thread.find('.info-area'),
            $entries = $thread.find('.entry'),
            $collapseLink = $thread.find(".collapse-link"),
            $subredditArea = $thread.find('.correspondent:first'),
            $subject = $thread.find(".subject"),
            $threadTrigger = $('<a>').attr('href', 'javascript:;').addClass('expand-btn tb-thread-view').text("threaded view"),
            $flatTrigger = $('<a>').attr('href', 'javascript:;').addClass('expand-btn tb-flat-view').text("flat view").css('display', 'none');

        
        self.endProfile("thread-jquery");
        
        var threadID = $thread.attr('data-fullname'),
            replyCount = ($entries.length - 1),
            subreddit = getSubname($thread),
            newThread = $thread.hasClass('realtime-new'),
            lmcThread = $thread.hasClass('lmc-thread');

        // Add back UI for new threads.
        if (newThread || lmcThread) {
            $thread.find('.correspondent:first').after(infoArea);
            $thread.find('.correspondent.reddit.rounded a:parent').prepend(collapseLink);

            $infoArea = $thread.find('.info-area');
            $collapseLink = $thread.find(".collapse-link");
        }

        self.log("\tNum entries = " + $entries.length);
        self.log("\tNum replies = " + replyCount);
        if (collapsed) {
            $collapseLink.text('[+]');
            $flatTrigger[0].style.display = 'none';
            $threadTrigger[0].style.display = 'none';
        }

        self.endProfile("thread-info");

        // Add MMP UI
        $subject.append($threadTrigger);
        $subject.append($flatTrigger);

        // Only one feature needs this, so disable it because it's costly.
        if (hideInviteSpam) {
            self.startProfile("thread-hide-invite-spam");
            
            $thread.find('.subject:first').contents().filter(function () {
                return this.nodeType === 3;
            }).wrap($('<span>').addClass('message-title'));

            self.endProfile("thread-hide-invite-spam");
        }

        if (replyCount > 0) {
            if ($thread.hasClass('moremessages')) {
                replyCount = replyCount.toString() + '+';
                moreCommentThreads.push(threadID);
            }
            $infoArea.find('.tb-message-count').text(replyCount);

            //Thread the message if required
            if (threadAlways) {
                threadModmail(threadID);
            }

        }
        else {
            unansweredThreads.push(threadID);

            // Only hide invite spam with no replies.
            if (hideInviteSpam) {
                var title = $thread.find('.message-title').text().trim();
                if (title === INVITE || title === ADDED) {
                    $thread.addClass('invitespam');
                }
            }
        }

        // Adds a colored border to modmail conversations where the color is unique to the subreddit. Basically similar to IRC colored names giving a visual indication what subreddit the conversation is for.
        if (subredditColor) {
            self.startProfile("thread-sr-color");
            
            var subredditName = $thread.find('.correspondent a[href*="moderator/inbox"]').text(),
                colorForSub = TBUtils.stringToColor(subredditName + subredditColorSalt);

            $thread.attr('style', 'border-left: solid 3px ' + colorForSub + ' !important');
            $thread.addClass('tb-subreddit-color');

            self.endProfile("thread-sr-color");
        }

        // Don't parse all entries if we don't need to.
        if (fadeRecipient) {
            TBUtils.forEachChunked($entries, 5, entryProcessRate,
                function (entry, idx, array) {
                    self.startProfile('fade-recipient-internal');
                    
                    // Fade the recipient of a modmail so it is much more clear WHO send it.
                    var $entry = $(entry),
                        $head = $entry.find('.tagline .head'),
                        $fadedRecipient;
    
                    // Ok this might be a tad complicated but it makes sure to fade out the recipient and also remove all reddit and RES clutter added to usernames.
    
                    // If there are two usernames we'll fade out the first one.
                    if ($head.find('a.author').length > 1) {
                        $fadedRecipient = $head.find('a.author').eq(1);
                        $fadedRecipient.addClass('recipient');
                        
                        // RES Stuff and userattrs
                        $head.addClass('tb-remove-res-two');
                        $head.find('.userattrs').eq(1).css('display', 'none');
                    }
                    // If it is just one username we'll only fade it out if the line contains "to" since that's us.
                    else if (/^to /.test($head.text())) {
                        $fadedRecipient = $head.find('a.author');
                        $fadedRecipient.addClass('recipient');
                        
                        // RES Stuff and userattrs
                        $head.addClass('tb-remove-res-one');
                        $head.find('.userattrs').css('display', 'none');
                    }
                    
                    self.endProfile('fade-recipient-internal');
                },
                function complete() {
                    self.endProfile('fade-recipient');
                },
                function starting() {
                    self.startProfile('fade-recipient');
                }
            );
        }

        // Deal with realtime threads.
        if (newThread) {
            self.log('New thread!');
            $thread.removeClass('realtime-new');
            $infoArea.css('background-color', 'yellow');
            $subredditArea.css('background-color', 'yellow');

            setView($thread);
            setFilterLinks($thread);

            if (collapsed) {
                $thread.find('.entry').css('display', 'none');
                $thread.find('.expand-btn').css('display', 'none');
            }

            $thread.fadeIn("slow");
        }

        // Deal with LMC threads
        if (lmcThread) {
            $collapseLink.text('[−]');
            if (threadOnExpand) {
                threadModmail(threadID);
            }

            if (expandReplies) {
                $thread.find('.expand-btn:first')[0].click();
            }

            setFilterLinks($thread);
        }

        self.endProfile("thread");
        perfCounter(threadStart, "Thread process time");
    }

    function addLmcSupport() {
        if (lmcSupport) return;
        lmcSupport = true;

        // RES NER support.
        $body.find('div.content').on('DOMNodeInserted', function (e) {
            if (!e.target.className) return;

            var $sender = $(e.target);

            if (!$sender.hasClass('message-parent')) {
                //modmail.log('node return: ' + e.target.className);
                return; //not RES, not flowwit, not load more comments, not realtime.
            }

            var event = new CustomEvent("TBNewThings");
            self.log('node check');

            if ($sender.hasClass('realtime-new')) { //new thread
                var attrib = $sender.attr('data-fullname');
                if (attrib) {
                    setTimeout(function () {
                        self.log('realtime go');
                        var thread = $(".message-parent[data-fullname='" + attrib + "']");
                        if (thread.length > 1) {
                            $sender.remove();
                        } else {
                            processThread(thread);
                            sentFromMMP = true;
                            window.dispatchEvent(event);
                        }
                    }, 500);
                }
            } else if ($.inArray($sender.attr('data-fullname'), moreCommentThreads) !== -1) { //check for 'load more comments'
                setTimeout(function () {
                    self.log('LMC go');
                    $sender.addClass('lmc-thread');
                    processThread($sender);
                    sentFromMMP = true;
                    window.dispatchEvent(event);
                }, 500);
            }
        });

        // NER support.
        window.addEventListener("TBNewThings", function () {
            if (sentFromMMP) {
                sentFromMMP = false;
                return;
            }
            initialize();
        });
    }
    
    function highlightNewThreads($threads) {
        self.startProfile('highlight-new-jquery');
        
        $threads.find('.entry:last').each(function (key, entry) {
            var $entry = $(entry),
                timestamp = new Date($entry.find('.head time').attr('datetime')).getTime();

            if (timestamp > lastVisited) {
                var $newThread = $entry.closest('.message-parent');

                $newThread.find('.info-area').addClass('new-highlight');
                $newThread.find('.correspondent:first').addClass('new-highlight');
                $newThread.addClass('new-messages');

                unreadThreads.push($newThread.data('fullname'));
            }
        });

        self.endProfile('highlight-new-jquery');
        
        TBUtils.forEachChunked($('.new-messages').find('.entry'), 10, entryProcessRate, function (entry) {
            self.startProfile('highlight-new-internal');
            
            var $entry = $(entry),
                timestamp = new Date($entry.find('.head time').attr('datetime')).getTime();

            if (timestamp > lastVisited) {
                $entry.find('.head').prepend($('<span>').addClass('new-label new-highlight').text('[NEW]'));

                // Expand thread / highlight new
                if ($entry.parent().hasClass('collapsed')) {
                    $entry.find('.expand:first').click();
                }

                newCount++;
            }

            self.endProfile('highlight-new-internal');
        }, function complete() {
            $('.unread-count').html('<b>' + newCount + '</b> - new message' + (newCount == 1 ? '' : 's'));

            self.endProfile('highlight-new');
        }, function start() {
            self.startProfile('highlight-new');
        });
    }
    
    function finalize() {
        enableCSSFeatures();
        
        // Tell the user how quick and awesome we are.
        var nowTime = performance.now(),
            secs = (nowTime - start) / 1000;

        // Round time
        secs = Math.round(secs * 100) / 100;

        TB.ui.textFeedback('Mod mail loaded in: ' + secs + ' seconds', TB.ui.FEEDBACK_POSITIVE, 2000 , TB.ui.DISPLAY_BOTTOM);

        // Profiling results
        self.endProfile('initialize');
        
        self.log("Profiling results: modmail");
        self.log("--------------------------");
        self.getProfiles().forEach(function (profile, key) {
            self.log(key + ":");
            self.log("\tTime  = "+profile.time.toFixed(4));
            self.log("\tCalls = "+profile.calls);
        });
        self.log("--------------------------");
    }

    // TODO: add to tbutils or tbmodule... not sure which just yet.
    function perfCounter(startTime, note) {
        if (!TB.utils.debugMode) return; //don't slow performance if not debugging.

        var nowTime = performance.now(),
            secs = (nowTime - startTime) / 1000;

        self.log(note + ' in: ' + secs + ' seconds');

        return nowTime;
    }

    function setView() {
        var a = [], //hacky-hack for 'all' view.
            filteredSubs = getFilteredSubs();

        // Neither a switch nor === will work correctly.
        if (inbox == ALL) {
            $allLink.closest('li').addClass('selected');
            hideThreads(a); // basically hideThreads(none);
            return;

        } else if (inbox == PRIORITY) {
            $priorityLink.closest('li').addClass('selected');
            hideThreads(filteredSubs);

        } else if (inbox == FILTERED) {
            $filteredLink.closest('li').addClass('selected');
            showThreads(filteredSubs);

        } else if (inbox == REPLIED) {
            $repliedLink.closest('li').addClass('selected');
            showThreads(getRepliedThreads(), true);

        } else if (inbox == UNREAD) {
            $unreadLink.closest('li').addClass('selected');
            showThreads(unreadThreads, true);

        } else if (inbox == UNANSWERED) {
            $unansweredLink.closest('li').addClass('selected');
            showThreads(unansweredThreads, true);
        }

        // Hide invite spam.
        if (hideInviteSpam && inbox != UNREAD) {
            $('.invitespam').each(function () {
                var $this = $(this);
                if ($this.hasClass('new')) {
                    $this.find('.entry').click();
                }

                $this.css('display', 'none');
            });
        }
    }

    function collapse() {
        $(this).parents(".thing:first").find("> .child").hide();
    }

    function noncollapse() {
        $(this).parents(".thing:first").find("> .child").show();
    }

    function threadModmail(fullname) {
        self.startProfile("threading");
        
        var $firstMessage = $("div.thing.id-" + fullname).addClass("threaded-modmail");

        if ($firstMessage.hasClass("hasThreads")) {
            $firstMessage.find(".thing").each(function () {
                var parent = $("div.thing.id-" + $(this).data("parent"));
                $(this).appendTo(parent.find("> .child"));
            });
        }
        else {
            var id = fullname.substring(3);
            
            $.getJSON("//www.reddit.com/message/messages/" + id + ".json", null, function (data) {
                var messages = data.data.children[0].data.replies.data.children;

                for (var i = 0; i < messages.length; i++) {
                    var item = messages[i].data;

                    var $message = $("div.thing.id-" + item.name);
                    var $dummy = $("<div></div>").addClass("modmail-dummy-" + item.name);
                    var $parent = $("div.thing.id-" + item.parent_id);

                    $message.data("parent", item.parent_id);

                    $dummy.insertAfter($message);
                    $message.appendTo($parent.find("> .child"));

                    $message.find("> .entry .noncollapsed .expand").bind("click", collapse);
                    $message.find("> .entry .collapsed .expand").bind("click", noncollapse);

                    $firstMessage.addClass("hasThreads");
                }
            });
        }

        self.endProfile("threading");
    }

    function flatModmail(fullname) {
        var firstMessage = $("div.thing.id-" + fullname).removeClass("threaded-modmail");

        firstMessage.find(".thing").each(function () {
            $(this).insertBefore(firstMessage.find(".modmail-dummy-" + $(this).data("fullname")));
        });
    }

    function setFilterLinks(threads) {
        if (threads === undefined) {
            threads = $('.message-parent');
        }

        // I think I could do this by just locating .filter-sub-link.
        threads.each(function () {
            var subname = getSubname(this);
            var linktext = 'F';

            if ($.inArray(subname, getFilteredSubs()) !== -1) {
                linktext = 'U';
            }

            $(this).find('.filter-sub-link').text(linktext);
        });
    }

    function setReplied(threads) {
        if (threads === undefined) {
            threads = $('.message-parent');
        }

        threads.each(function () {
            var $this = $(this),
                id = $this.attr('data-fullname');

            if ($.inArray(id, getRepliedThreads()) !== -1) {
                $this.find('.replied-tag').html('&nbsp;R');
                $this.removeClass('invitespam'); //it's not spam if we replied.
            }
        });
    }

    function getSubname(sub) {
        return TB.utils.cleanSubredditName($(sub).find('.correspondent.reddit.rounded a').text()).toLowerCase();
    }

    function getFilteredSubs() {
        return self.setting('filteredSubs');
    }

    function getRepliedThreads() {
        return self.setting('replied');
    }

    function showThreads(items, byID) {
        $('.message-parent').each(function () {
            var $this = $(this);
            $this.hide();

            if (!byID) {
                var subname = getSubname(this);

                if ($.inArray(subname, items) !== -1) {
                    $this.show();
                }

            } else {
                var id = $this.attr('data-fullname');

                if ($.inArray(id, items) !== -1) {
                    $this.show();
                }
            }
        });
    }

    function hideThreads(subs) {
        $('.message-parent').each(function () {
            var subname = getSubname(this);
            var $this = $(this);
            $this.show();

            if ($.inArray(subname, subs) !== -1) {
                $this.hide();
            }
        });
    }

    function collapseall(threads) {
        self.log('collapsing all');
        collapsed = true;
        var $link = $('.collapse-all-link');

        // make look selected.
        $link.css(selectedCSS);

        // Hide threads.
        if (threads === undefined) {
            threads = $('.message-parent');
        }

        TBUtils.forEachChunked(threads, 25, 250, function (thread) {
            $(thread).find('.entry').hide();
            $(thread).find('.expand-btn').hide();
        });

        $link.text('expand all');
        $('.collapse-link').text('[+]');
    }

    function expandall() {
        collapsed = false;
        var $link = $('.collapse-all-link');

        // make look unselected.
        $link.css(unselectedCSS);

        // Show threads.
        var threads = $('.message-parent');

        TBUtils.forEachChunked(threads, 35, 250, function (thread) {
            $(thread).find('.entry').show();
            $(thread).find('.expand-btn').show();

            if (expandReplies) {
                $(thread).find('.expand-btn:first')[0].click();
            }

            if (threadOnExpand) {
                $(thread).find('.tb-thread-view')[0].click();
            }
        });

        $link.text('collapse all');
        $('.collapse-link').text('[−]');
    }

    /// EVENTS ///
    $body.on('click', '.save', function (e) {
        var parent = $(e.target).closest('.message-parent'),
            id = $(parent).attr('data-fullname'),
            replied = getRepliedThreads();

        // Add sub to filtered subs.
        if ($.inArray(id, replied) === -1 && id !== null) {
            replied.push(id);
        }

        self.setting('replied', replied);

        setReplied();
    });

    $body.on('click', '.prioritylink, .alllink, .filteredlink, .repliedlink, .unreadlink, .unansweredlink', function (e) {
        // Just unselect all, then select the caller.
        $($menuList).find('li').removeClass('selected');

        inbox = $(e.target).attr('view');

        setView();
    });

    $body.on('click', '.collapse-all-link', function () {
        if (collapsed) {
            expandall();
        } else {
            collapseall();
        }
    });

    $body.on('click', '.collapse-link', function () {
        var $this = $(this),
            $parent = $this.closest('.message-parent');
        if ($this.text() === '[−]') {
            $parent.find('.entry').hide();
            $parent.find('.expand-btn').hide();
            $this.text('[+]');
            $parent.addClass('mmp-collapsed');
        } else {
            $parent.find('.entry').show();
            $parent.find('.expand-btn').show();
            $this.text('[−]');
            $parent.removeClass('mmp-collapsed');

            //Show all comments
            if (expandReplies) {
                $parent.find('.expand-btn:first')[0].click();
            }

            if (threadOnExpand) {
                $parent.find('.tb-thread-view')[0].click();
            }
        }
    });

    // Threading methods.
    $body.on('click', '.tb-flat-view', function () {
        flatModmail($(this).closest('.message-parent').data('fullname'));
    });

    $body.on('click', '.tb-thread-view', function () {
        threadModmail($(this).closest('.message-parent').data('fullname'));
    });

    $body.on('click', '.filter-sub-link', function (e) {
        var subname = getSubname($(e.target).closest('.message-parent')),
            filtersubs = getFilteredSubs(),
            $filterCount = $('.filter-count');

        // Add sub to filtered subs.
        if ($.inArray(subname, filtersubs) === -1) {
            filtersubs.push(subname);
        } else {
            filtersubs.splice(filtersubs.indexOf(subname), 1);
        }

        // Save new filter list.
        self.setting('filteredSubs', filtersubs);

        // Refilter if in filter mode.
        setView();

        // Relabel links
        setFilterLinks();

        // Update filter count in settings.
        $filterCount.text(filtersubs.length);
        $filterCount.attr('title', filtersubs.join(', '));
    });
};


self.realtimemail = function () {
    // Don't run if the page we're viewing is paginated, or if we're in the unread page.
    if (location.search.match(/before|after/) || location.pathname.match(/\/moderator\/(?:unread)\/?/) || location.pathname.match(/\/r\/?/)) return;

    var delay = 30000, // Default .5 min delay between requests.
        refreshLimit = 15, // Default five items per request.
        refreshLink = $('<li><a class="refresh-link" href="javascript:;" title="NOTE: this will only show new threads, not replies.">refresh</a></li>'),
        updateURL = '/message/moderator?limit=',
        menulist = $('.menuarea ul.flat-list:first');

    var selectedCSS = {
        "color": "orangered",
        "font-weight": "bold"
    };
    var unselectedCSS = {
        "color": "#369",
        "font-weight": "normal"
    };

    // Add refresh button.
    $(refreshLink).click(function () {
        $(refreshLink).css(selectedCSS);
        getNewThings(refreshLimit);

    });
    menulist.append($(refreshLink).prepend('<span>&nbsp;&nbsp;&nbsp;&nbsp;</span>'));

    // Run RTMM.
    if (self.setting('autoLoad') && TB.storage.getSetting('Notifier', 'enabled', true)) {
        setInterval(function () {
            var count = TB.storage.getSetting('Notifier', 'modmailCount', 0);
            if (count > 0) {
                $(refreshLink).css(selectedCSS);
                getNewThings(count);
            }
        }, delay);
    }

    // Add new things
    function getNewThings(limit) {
        TB.storage.setSetting('Notifier', 'lastSeenModmail', new Date().getTime());
        TB.storage.setSetting('Notifier', 'modmailCount', 0);

        self.log('real time a gogo: ' + limit);
        TBUtils.addToSiteTaable(updateURL + String(limit), function (resp) {
            if (!resp) return;
            var $things = $(resp).find('.message-parent').addClass('realtime-new').hide();
            var $siteTable = $('#siteTable');

            $siteTable.prepend($things);
            $(refreshLink).css(unselectedCSS);
        });
    }
};


self.mailDropDorpDowns = function () {
    var COMPOSE = 'compose-message',
        SWITCH = 'switch-modmail',
        composeURL = '/message/compose?to=%2Fr%2F',
        $composeSelect = $('<li><select class="compose-mail" style="background:transparent;"><option value="' + COMPOSE + '">compose mod mail</option></select></li>'),
        $switchSelect = $('<li><select class="switch-mail" style="background:transparent;"><option value="' + SWITCH + '">switch mod mail</option></select></li>'),
        $mmpMenu = $('.mmp-menu');

    TBUtils.getModSubs(function () {
        populateDropDowns();
    });

    function populateDropDowns() {
        $mmpMenu.append($composeSelect.prepend('<span>&nbsp;&nbsp;&nbsp;&nbsp;</span>'));
        $mmpMenu.append($switchSelect.prepend('<span>&nbsp;&nbsp;&nbsp;&nbsp;</span>'));

        $(TBUtils.mySubs).each(function () {
            $('.compose-mail').append($('<option>', {
                value: this
            }).text(this));

            $('.switch-mail').append($('<option>', {
                value: this
            }).text(this));
        });

        $('.compose-mail').change(function () {
            var $this = $(this);
            var sub = $this.val();
            if (sub !== COMPOSE) {
                window.open(composeURL + $this.val());
                $(this).val(COMPOSE);
            }
        });

        $('.switch-mail').change(function () {
            var sub = $(this).val();
            if (sub !== SWITCH) {
                window.open('/r/' + sub + '/message/moderator/inbox');
                $(this).val(SWITCH);
            }
        });
    }
};

TB.register_module(self);
} // modmailpro() wrapper

(function () {
    window.addEventListener("TBObjectLoaded", function () {
        modmailpro();
    });
})();
