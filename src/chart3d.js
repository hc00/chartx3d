import { _, dataFrame, global, $ } from 'mmvis';
import { Application } from './framework/application';
import { InertialSystem } from './framework/coord/inertial';
import { Cartesian3D } from './framework/coord/cartesian3d';
import { Component } from './components/Component';


import { Events } from 'mmgl/src/index';
import { OrbitControls } from './framework/OrbitControls';
import { Interaction } from './framework/interaction';
import { MainView, LabelView, VERSION } from './constants';

let __tipShowEvent = null, __tipHideEvent = null, __tipMoveEvent = null, __redraw = null;

let _cid = 0;
class Chart3d extends Events {
    constructor(node, data, opt, componentModules) {
        super();
        console.log('Chart3D ', VERSION);
        this.domSelector = node;
        this.opt = opt;
        this.data = data;

        this.componentModules = componentModules;


        this.el = null;
        this.view = null;
        this.domView = null;
        this.stageView = null;
        this.canvasDom = null;   //画布DOM元素


        this.width = 0;     //画布的宽
        this.height = 0;    //画布的高 

        this.renderer = null;
        this.renderView = null;
        this.app = null;
        this.currCoord = null;


        //初始化画布
        this._createDomContainer(node);

        // //初始化数据
        // //不管传入的是data = [ ['xfield','yfield'] , ['2016', 111]]
        // //还是 data = [ {xfiled, 2016, yfield: 1111} ]，这样的格式，
        // //通过parse2MatrixData最终转换的是data = [ ['xfield','yfield'] , ['2016', 111]] 这样 chartx的数据格式
        // //后面有些地方比如 一些graphs中会使用dataFrame.org，， 那么这个dataFrame.org和_data的区别是，
        // //_data是全量数据， dataFrame.org是_data经过dataZoom运算过后的子集
        // this._data = parse2MatrixData(data);

        //三维引擎初始化
        this.app = new Application(this.width, this.height);


        //初始化渲染器
        this.renderer = this.app._framework.renderer;


        //组件管理机制,所有的组件都绘制在这个地方
        this.components = [];

        this.inited = false;
        this.dataFrame = this._initData(this.data, {}); //每个图表的数据集合 都 存放在dataFrame中。

        this.initComponent();

    }
    init(DefaultControls) {
        let me = this;
        let rendererOpts = _.extend({}, DefaultControls);
        this.opt.coord.controls = this.opt.coord.controls || {};
        let controlOpts = this.opt.coord.controls = _.extend(rendererOpts, this.opt.coord.controls);

        this._initRenderer(rendererOpts);
        let controls = this.orbitControls = new OrbitControls(this.renderView._camera, this.view);



        let interaction = this.interaction = new Interaction(this.view);

        interaction.addView(this.labelView);
        interaction.addView(this.renderView);


        // controls.minDistance = controlOpts.minDistance;
        // controls.maxDistance = controlOpts.maxDistance;

        // controls.minZoom = controlOpts.minZoom;
        // controls.maxZoom = controlOpts.maxZoom;
        // controls.enableDamping = true;
        // controls.enablePan = false;
        // controls.enableKeys = false;
        // controls.autoRotate = controlOpts.autoRotate;
        // controls.autoRotateSpeed = 1.0;

        _.extend(true, controls, controlOpts);

        //自动旋转时间
        if (controls.autoRotate) {
            window.setTimeout(() => {
                controls.autoRotate = false;
            }, 15000);
        }


        //如果发生交互停止自动旋转
        controls.on('start', onStart);
        //有交互开始渲染
        this._onChangeBind = onChange.bind(me);
        controls.on('change', this._onChangeBind);

        this._onRenderBeforeBind = onRenderBefore.bind(controls);
        this.app._framework.on('renderbefore', this._onRenderBeforeBind);

        this._onRenderAfterBind = onRenderAfter.bind(interaction);
        this.app._framework.on('renderafter', this._onRenderAfterBind)

        interaction.on('refresh', this._onChangeBind);


        // //同步主相机的位置和方向
        // controls.on('change', (e) => {
        //    this.labelView._camera.position.copy(e.target.object.position);
        //    this.labelView._camera.lookAt(e.target.target);
        // })

        //启动渲染进程
        this.app.launch();
        this._onWindowResizeBind = me.resize.bind(me);
        window.addEventListener('resize', this._onWindowResizeBind, false);

        //绑定tip事件
        this.bindEvent()
    }
    setCoord(_Coord) {

        //初始化物体的惯性坐标(放在具体的坐标系下)
        if (_Coord === InertialSystem || _Coord.prototype instanceof InertialSystem) {
            this.currCoord = new _Coord(this);

            // this.currCoord = _Coord;
            this.rootStage.add(this.currCoord.group);
        }


    }
    getCoord() {
        return this.currCoord;
    }

    initComponent() {
        let opts = this.opt;
        this.components = [];

        //先初始化皮肤组件
        if ('theme' in opts) {
            let theme = this.componentModules.get('theme');
            if (theme) {
                this.addComponent(theme, opts.theme);
            }
        }

        //先初始化坐标系
        let coord = this.componentModules.get('coord', opts.coord.type)
        if (!coord) {
            coord = InertialSystem;
        }
        this.setCoord(coord);
        //加载graph组件
        for (let t = 0; t < opts.graphs.length; t++) {
            let key = opts.graphs[t].type;
            let comp = this.componentModules.get('graphs', key);
            if (comp) {
                this.addComponent(comp, opts.graphs[t]);
            }

        }
        //加载其他组件
        for (let p in opts) {
            if (p === 'coord') continue;
            if (p === 'graphs') continue;
            if (_.isArray(opts[p])) {
                for (let t = 0; t < opts[p].length; t++) {
                    let key = opts[p][t].type;
                    let comp = this.componentModules.get(p, key);
                    this.addComponent(comp, opts[p][t]);
                }
            } else {
                let comp = this.componentModules.get(p);
                if (comp) {
                    this.addComponent(comp, opts[p]);
                }
            }
        }

    }
    //添加组件
    addComponent(cmp, opts) {
        //todo 图像是否要分开,目前没有分开共用Component一个基类
        if (cmp.prototype instanceof Component) {

            let instance = new cmp(this, opts);
            this.components.push(instance);
        }

    }

    drawComponent() {
        //先绘制坐标系
        this.currCoord.drawUI();
        this.components.forEach(cmp => {
            this.currCoord.group.add(cmp.group);
            cmp.draw();
        })
    }

    draw() {
        this.currCoord.initCoordUI();
        this.drawComponent();
        this.app.forceRender();

    }


    getComponent(query) {
        let cmp = this.getComponents(query)[0];
        return !cmp ? null : cmp
    }
    getComponents(query) {
        let arr = [];
        let result = true;
        this.components.forEach(cmp => {
            result = true;
            for (let key in query) {
                if (_.isString(cmp[key]) && _.isString(query[key])) {
                    result = result && cmp[key].toLowerCase() == query[key].toLowerCase();
                } else {
                    result = result && cmp[key] == query[key];
                }
            }
            if (result) {
                arr.push(cmp);
            }
        });

        return arr;

    }

    bindEvent() {
        __redraw = (e) => {
            if (this.currCoord) {
                this.currCoord.fire({ type: 'legendchange', data: e.data });
            }
            this.draw();
        }
        this.on('legendchange', __redraw);

        const TipName = 'Tips';

        __tipShowEvent = (e) => {

            let tips = this.getComponent({ name: TipName });
            let { offsetX: x, offsetY: y } = e.event;
            if (tips !== null) {
                let _title = e.data.xField ? e.data.rowData[e.data.xField] : "";
                tips.show({
                    eventInfo: _.extend({
                        title: _title,
                    }, e.data),
                    pos: {
                        x,
                        y
                    }
                })
            }
        };

        __tipHideEvent = (e) => {

            let tips = this.getComponent({ name: TipName });
            if (tips !== null) {
                tips.hide();
            }
        };
        __tipMoveEvent = (e) => {

            let tips = this.getComponent({ name: TipName });
            let { offsetX: x, offsetY: y } = e.event;
            let _title = e.data.xField ? e.data.rowData[e.data.xField] : "";
            if (tips !== null) {
                tips.show({
                    eventInfo: _.extend({
                        title: _title,
                    }, e.data),
                    pos: {
                        x,
                        y
                    }
                })
            }
        }
        this.on('tipShow', __tipShowEvent);
        this.on('tipHide', __tipHideEvent)
        this.on('tipMove', __tipMoveEvent)

    }

    _createDomContainer(_domSelector) {

        let viewObj = null;

        this._cid = "chartx3d_" + _cid++;

        this.el = $.query(_domSelector);

        this.width = this.el.offsetWidth;
        this.height = this.el.offsetHeight;

        viewObj = $.createView(this.width, this.height, this._cid);

        this.view = viewObj.view;
        this.stageView = viewObj.stageView;
        this.domView = viewObj.domView;

        this.el.innerHTML = "";
        this.el.appendChild(this.view);


        this.id = "chartx_" + this._cid;
        this.el.setAttribute("chart_id", this.id);
        this.el.setAttribute("chartx3d_version", "1.0");
    }

    _initData(data, opt) {

        return dataFrame.call(this, data, opt);
    }

    _initRenderer(rendererOpts) {
        let app = this.app;

        //正常绘制的view
        let renderView = this.renderView = app.createView(MainView);
        //label 绘制的View
        let labelView = this.labelView = app.createView(LabelView);

        // let renderView = this.renderView = app.getView(MainView);
        // let labelView = this.labelView = app.getView(LabelView);


        this.rootStage = app.addGroup({ name: 'rootStage' });
        renderView.addObject(this.rootStage);
        renderView.setSize(this.width, this.height);
        renderView.setBackground(0xFFFFFF);

        //默认透视投影
        renderView.setControls(rendererOpts);
        renderView.project('perspective'); //'ortho' | 'perspective',

        //初始化labelView
        this.labelGroup = app.addGroup({ name: 'labelsGroup', flipY: true });

        labelView.addObject(this.labelGroup);
        labelView.setSize(this.width, this.height);
        //labelView.setBackground("rgba(0,0,0,0)");
        labelView.setControls(rendererOpts);
        //labelView.project('ortho'); //'ortho' | 'perspective',
        labelView.createScreenProject();


        if (this.canvasDom) {
            this.stageView.removeChild(this.canvasDom)
            this.canvasDom = null;
        }

        this.stageView.appendChild(this.renderer.domElement);


        this.canvasDom = this.renderer.domElement;

    }
    resize() {
        this.width = this.el.offsetWidth;
        this.height = this.el.offsetHeight;
        this.app.resize(this.width, this.height, this.opt.coord.controls.boxHeight);
    }

    //ind 如果有就获取对应索引的具体颜色值
    getTheme(ind) {
        var colors = global.getGlobalTheme();
        var _theme = this.getComponent({ name: 'theme' });
        if (_theme) {
            colors = _theme.get();
        };
        if (ind != undefined) {
            return colors[ind % colors.length] || "#ccc";
        };
        return colors;
    }

    //数据变更后调用reset
    reset(opt, data) {

        !opt && (opt = {});

        //配置初始化
        _.extend(true, this.opt, opt);
        //数据初始化
        if (data) {
            this.data = data;
            //this._data = parse2MatrixData(data);
            this.dataFrame = this._initData(this.data, {});
        };


        this.dispose();

        //三维引擎初始化
        this.app = new Application(this.width, this.height);
        //初始化渲染器
        this.renderer = this.app._framework.renderer;

        this.init();

        //坐标系重新初始化
        let coord = null;
        if (this.opt.coord.type == 'box') {
            coord = new Cartesian3D(this);
        }
        this.setCoord(coord);

        //组件重新初始化
        this.components = [];

        this.initComponent();

        this.draw();

    }
    /*
     * 只响应数据的变化，不涉及配置变化
     * 
     * @dataTrigger 一般是触发这个data reset的一些场景数据，
     * 比如如果是 datazoom 触发的， 就会有 trigger数据{ name:'datazoom', left:1,right:1 }
     */
    resetData(data, dataTrigger) {

        //销毁默认绑定的事件
        // this.off('tipShow', __tipShowEvent);
        // this.off('tipHide', __tipHideEvent)
        // this.off('tipMove', __tipMoveEvent)
        //this.off('legendchange', __redraw);

        if (data) {
            this.data = data;
            //this._data = parse2MatrixData(data);
            this.dataFrame = this._initData(this.data, this.opt);
        };
        this.currCoord.resetData();
        this.components.forEach(cmp => {
            cmp.resetData();
        })
        this.fire({ type: 'resetData' });

        this.app.forceRender();
    }
    destroy() {
        //外部调用适配
        this.dispose();
        this.fire({ type: 'destroy' });
    }

    dispose() {

        //销毁默认绑定的事件
        this.off('tipShow', __tipShowEvent);
        this.off('tipHide', __tipHideEvent)
        this.off('tipMove', __tipMoveEvent)

        //先销毁坐标系统
        if (this.currCoord) {
            this.currCoord.dispose();
        }

        //销毁组件
        this.components.forEach(cmp => {
            cmp.dispose();
        });
        this.components = [];
        //初始化渲染状态
        if (this.app) {
            this.app.resetState();
        }


        //清理渲染数据
        if (this.renderer) {
            this.renderer.dispose();
        }



        //清理事件
        if (this.orbitControls) {
            this.orbitControls.off('start', onStart);
            this.orbitControls.off('change', this._onChangeBind);
            this.orbitControls.dispose();
        }

        if (this.app) {
            this.app._framework.off('renderbefore', this._onRenderBeforeBind);
            this._onRenderBeforeBind = null;

            this.app._framework.off('renderafter', this._onRenderAfterBind)
            this._onRenderAfterBind = null;
            this.app.dispose();
        }

        if (this.interaction) {
            this.interaction.off('refresh', this._onChangeBind);
            this._onChangeBind = null;
            this.interaction.dispose();
        }




        window.removeEventListener('resize', this._onWindowResizeBind, false);
        this._onWindowResizeBind = null;


        this.app = null;
        this.renderer = null;
        this.currCoord = null;

        //todo 内存对象清除优化


    }
}


function onStart() {
    this.autoRotate = false
};

function onChange(e) {
    this.app.forceRender();
}

function onRenderBefore() {
    if (this.position0.equals(this.object.position) && this.zoom0 === this.object.zoom) {
        return;
    }
    this.saveState();
    this.update();
}

function onRenderAfter() {
    this.update();
}

global.registerComponent(Chart3d, 'chart', 3);

export default Chart3d;

