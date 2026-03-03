(function () {
    var timerLoadPackage = setInterval(() => {
        // 1.判断是否已经贴靠
        if (!window.__MY_PACKAGE_LOADED) {
            try {
                var dockUtil;
                var dropMgr;
                var panelMgr;
                var tabs;
                var package = 'add_component';

                console.log("template-auto-dock, start");
                // 2.从renderer内存中找到这几个贴靠插件需要用到的助手，下面这段代码是核心，看不明白的留言
                Object.keys(require.cache).map((file) => {
                    if (/dock-utils\.js$|dock-utils\.ccc$/.test(file)) {
                        dockUtil = require(file);
                    }
                    if (/drag-drop\.js$|drag-drop\.ccc$/.test(file)) {
                        dropMgr = require(file);
                    }
                    if (/renderer\/panel\.js$|renderer\/panel\.ccc$|renderer\\panel\.js$|renderer\\panel\.ccc$/.test(file)) {
                        panelMgr = require(file);
                    }
                });
                [...document.getElementsByTagName('ui-dock-panel')].map((panel) => {
                    if (/inspector/.test(panel.innerHTML)) {
                        tabs = panel.$tabs;
                    }
                })

                if (dockUtil && tabs && panelMgr) {
                    panelMgr.close = (function (orgFunc) {
                        return function (...args) {
                            if ([...args][0] == package) {
                                let callback = [...args][1];
                                return orgFunc([...args][0], (error, others) => {
                                    callback(null, others)
                                });
                            }
                            return orgFunc(...args);
                        }
                    })(panelMgr.close);
                    dropMgr.items = (function (orgFunc) {
                        return function (...args) {
                            let result = window.__specified_panel ? [window.__specified_panel] : orgFunc(...args)
                            return result;
                        }
                    })(dropMgr.items);


                    window.__specified_panel = {
                        panelID: package,
                        panelPreferredHeight: 0,
                        panelPreferredWidth: 0,
                        panelRectHeight: 0,
                        panelRectWidth: 0
                    };

                    //3.贴靠插件，上文所有代码，都是为这句服务的
                    dockUtil.dropTab(tabs)
                    window.__specified_panel = null;
                    //4.可选，让自己的插件失去焦点，可以让用户无感知地加载
                    panelMgr.focus('inspector');
                    Editor.Selection.select("node");
                }
            } catch (error) {
                console.log(error)
            }
        } else {
            clearInterval(timerLoadPackage)
        }
    }, 1000 / 30);
})()