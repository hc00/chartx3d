
import { InertialSystem } from './inertial';
import { Vector3, Box3, Matrix3, Matrix4, Math as _Math, AmbientLight, PointLight, DirectionalLight } from 'mmgl/src/index'
import { Cartesian3DUI } from '../../components/cartesian3dUI/index'
import { _, dataSection } from 'mmvis/src/index';
import { AxisAttribute } from './model/axisAttribute';


/** note: 
 * 获取所有的配置信息,取去配置中影响布局的相关参数
 * coord{
 *    xAsix:{}
 *    yAxis:[] 
 *    zAxis:{} 
 * }
 * 
 * graphs{}
 * 
 * makeline其他组件
 * 
 * 通过Data和相关的配置,给出各个坐标轴的DataSection,计算出各个轴上数据点对应的位置
 * 
 * ***/
const DEFAULT_AXIS = 'default_axis_for_Y';
const cartesian_wm = new WeakMap();

class Cartesian3D extends InertialSystem {
    constructor(el, data, opts, graphs, components) {
        super(el, data, opts, graphs, components);

        //相对与世界坐标的原点位置

        this.origin = new Vector3(0, 0, 0);
        this.center = new Vector3(0, 0, 0);

        this.offset = new Vector3(0, 0, 0);

        this.boundbox = new Box3();

        this.xAxisAttribute = new AxisAttribute(this._root);
        //默认Y轴
        this.yAxisAttribute = {};

        this.zAxisAttribute = new AxisAttribute(this._root);

        this._coordUI = null;

        this.group.name = 'cartesian3dSystem';

        this.init();

    }
    setDefaultOpts(opts) {
        var me = this;
        this._zSection = [];
        me.coord = {
            xAxis: {
                //波峰波谷布局模型，默认是柱状图的，折线图种需要做覆盖
                layoutType: "rule", //"peak",  
                //默认为false，x轴的计量是否需要取整， 这样 比如某些情况下得柱状图的柱子间隔才均匀。
                //比如一像素间隔的柱状图，如果需要精确的绘制出来每个柱子的间距是1px， 就必须要把这里设置为true
                posParseToInt: false
            },
            yAxis: [], //y轴至少有一个
            zAxis: {
                enabled: true,
                field: '',
                layoutType: "rule",
                //   depth: 50     //最大深度是1000
            }
        };

        opts = _.clone(opts);

        //规范Y轴的定义,采用数组形式,如果没有定义就初始化为空数组
        if (opts.coord.yAxis) {
            var _nyarr = [];
            _.each(_.flatten([opts.coord.yAxis]), function (yopt, index) {
                //标记定义的Y轴信息是否在绘图中使用
                yopt._used = false;
                //如果坐标轴没有置顶名称,第一个为默认坐标轴,其余的将被舍弃
                if (_.isEmpty(yopt.name)) {
                    if (index == 0) {
                        yopt.name = DEFAULT_AXIS;
                    } else {
                        return;
                    }
                }
                _nyarr.push(_.clone(yopt));


            });
            opts.coord.yAxis = _nyarr;
        } else {
            opts.coord.yAxis = [];
        }



        let getYaxisInfo = (name) => {
            let _opt = null;
            if (opts.coord.yAxis) {
                _.each(_.flatten([opts.coord.yAxis]), function (yopt) {
                    if (yopt.name == name) {
                        yopt._used = true;
                        _opt = yopt
                    }
                })
            }
            return _opt;
        }



        //根据opt中得Graphs配置，来设置 coord.yAxis
        if (opts.graphs) {
            //有graphs的就要用找到这个graphs.field来设置coord.yAxis
            for (var i = 0; i < opts.graphs.length; i++) {

                var graphs = opts.graphs[i];
                this._zSection.push(graphs.field.toString());
                if (graphs.type == "bar3d") {
                    //如果graphs里面有柱状图，那么就整个xAxis都强制使用 peak 的layoutType
                    me.coord.xAxis.layoutType = "peak";
                    me.coord.zAxis.layoutType = "peak";
                }
                if (graphs.field) {
                    //没有配置field的话就不绘制这个 graphs了
                    //根据graphs中的数据整理y轴的数据
                    let _axisName = graphs.yAxisName;
                    if (!graphs.yAxisName) {
                        //没有指定坐标轴的名称,取默认轴
                        _axisName = DEFAULT_AXIS
                    }
                    //增加Y轴
                    let _tAxis = getYaxisInfo(_axisName)
                    if (!_tAxis) {
                        let _yAxisNew = {
                            field: [],
                            name: _axisName,
                            _used: true
                        }
                        if (_.isArray(graphs.field)) {
                            _yAxisNew.field = _yAxisNew.field.concat(graphs.field);
                        } else {
                            _yAxisNew.field.push(graphs.field)
                        }
                        opts.coord.yAxis.push(_yAxisNew);
                    } else {

                        if (_.isEmpty(_tAxis.field)) {
                            _tAxis.field = [];
                        }
                        if (_.isArray(_tAxis.field)) {
                            if (_.isArray(graphs.field)) {
                                _tAxis.field = _tAxis.field.concat(graphs.field);
                            } else {
                                _tAxis.field.push(graphs.field);
                            }
                        } else {
                            if (_.isArray(graphs.field)) {
                                _tAxis.field = [_tAxis.field].concat(graphs.field);
                            } else {
                                _tAxis.field = [_tAxis.field].push(graphs.field);
                            }
                        }
                    }

                } else {
                    //在，直角坐标系中，每个graphs一定要有一个field设置，如果没有，就去掉这个graphs
                    opts.graphs.splice(i--, 1);
                }
            }


        };
        //初始化Y轴的相关参数
        for (var i = 0; i < opts.coord.yAxis.length; i++) {
            if (!opts.coord.yAxis[i].layoutType) {
                opts.coord.yAxis[i].layoutType = 'proportion'; //默认布局
            }
            //没有field的Y轴是无效的配置
            if (_.isEmpty(opts.coord.yAxis[i].field) || opts.coord.yAxis[i]._used == false) {
                opts.coord.yAxis.splice(i--, 1);
            }
            if (opts.coord.yAxis[i]) {
                delete opts.coord.yAxis[i]._used;
            }

        };
        return opts;
    }

    init() {


        let opt = _.clone(this.coord);
        try {

            //X轴数据集初始化
            if (opt.xAxis.field) {
                this.xAxisAttribute.setField(opt.xAxis.field);
            } else {
                console.error('没有配置X轴对应的字段field,请配置coord.xAxis.field')
            }

            var arr = _.flatten(this.xAxisAttribute.data);

            if (this.coord.xAxis.layoutType == "proportion") {
                if (arr.length == 1) {
                    arr.push(0);
                    arr.push(arr[0] * 2);
                };
                arr = arr.sort(function (a, b) { return a - b });
                arr = dataSection.section(arr)
            };
            arr = _.uniq(arr);
            this.xAxisAttribute.setOrgSection(arr);
            //如果用户指定了dataSection,就采用用户自己的
            if (opt.xAxis.dataSection) {
                this.xAxisAttribute.setCustomSection(opt.xAxis.dataSection);
            }

            //y轴的颜色值先预设好
            let _allField = [];
            opt.yAxis.forEach(yx => {
                yx.field.forEach(fd => {
                    if (_.isArray(fd)) {
                        fd.forEach(fname => {
                            _allField.push(fname);
                        })
                    } else {
                        _allField.push(fd);
                    }
                })
            })
            let _colors = [], _colorMap = {};
            let getTheme = this._root.getTheme.bind(this._root);
            _allField.forEach((v, i) => {
                let color = getTheme(i);
                _colors.push(color);
                _colorMap[v] = color;
            })


            //Y轴数据集初始化
            //初步计算坐标轴的dataSection
            let maxSegment = 0;
            let maxSegmentUser = Infinity;
            opt.yAxis.forEach((yopt) => {
                let _yAxisAttr = this.yAxisAttribute[yopt.name];
                if (!_yAxisAttr) {
                    _yAxisAttr = new AxisAttribute(this._root);
                    this.yAxisAttribute[yopt.name] = _yAxisAttr;
                    cartesian_wm.set(this.yAxisAttribute[yopt.name], yopt);
                }
                _yAxisAttr.setField(yopt.field);
                let dataOrg = _yAxisAttr.data;

                let joinArr = [];
                if (dataOrg.length == 1 && !_.isArray(dataOrg[0])) {
                    joinArr.push(dataOrg[0] * 2);
                };


                if (yopt.layoutType == 'proportion') {
                    _yAxisAttr.computeDataSection(joinArr);
                } else {
                    var arr = _.flatten(_yAxisAttr.data);
                    _yAxisAttr.setOrgSection(arr);
                }

                //如果用户制定了某个轴的dataSection,就采用用户制定的最短dataSection的个数定义Y轴的数据
                //否则则采用自动计算后最多的段,重新计算其他的坐标轴

                if (yopt.dataSection) {
                    maxSegmentUser = Math.min(maxSegmentUser, yopt.dataSection.length);
                    _yAxisAttr.setCustomSection(yopt.dataSection);
                }
                _yAxisAttr.setColors(_colorMap);
                maxSegment = Math.max(maxSegment, _yAxisAttr.getSection().length);
            });

            //根据最多段重新计算dataSection
            maxSegment = maxSegmentUser === Infinity ? maxSegment : maxSegmentUser;
            for (let _yAxisAttr in this.yAxisAttribute) {
                let _section = this.yAxisAttribute[_yAxisAttr].getSection();
                let step = (_section[_section.length - 1] - _section[0]) / (maxSegment - 1);
                if (step > 1) {
                    step = Math.ceil(step);
                }
                //如果不相等,按照固定的段重新计算
                if (_section.length !== maxSegment) {
                    let arr = [];
                    for (var i = 0; i < maxSegment; i++) {
                        arr.push(_section[0] + i * step);
                    }
                    this.yAxisAttribute[_yAxisAttr].setCustomSection(arr);
                }

            }
            //Z轴的计算
            if (opt.zAxis.field) {
                //如果设定了z轴的具体字段,就把该州作为Z的具体值
                this.zAxisAttribute.setField(opt.zAxis.field);
                var arr = _.flatten(this.zAxisAttribute.data);

                if (this.coord.zAxis.layoutType == "proportion") {
                    if (arr.length == 1) {
                        arr.push(0);
                        arr.push(arr[0] * 2);
                    };
                    arr = arr.sort(function (a, b) { return a - b });
                    arr = dataSection.section(arr)
                };
                arr = _.uniq(arr);
                this.zAxisAttribute.setOrgSection(arr);

            } else {
                //todo:没有指定具体的field,用Y轴的分组来作为z轴的scetion
                //有多少个Y轴,Z轴上就有多少个点,默认显示轴对应字段的名称
                // let _sectionZ = [];
                // opt.graphs.forEach((yOps) => {
                //     debugger
                //     _sectionZ.push(yOps.field.toString());
                // })


                this.zAxisAttribute.setOrgSection(this._zSection);
            }



            if (opt.zAxis.dataSection) {
                this.zAxisAttribute.setCustomSection(opt.zAxis.dataSection);
            }







        } catch (e) {
            console.error('配置出错啦!', e);
        }
        //先计算一次空间范围供计算坐标轴宽高使用
        this.getBoundbox();
        this.addLights();
    }
    getYAxis(name = DEFAULT_AXIS) {
        let yAxisAttr = this.yAxisAttribute[name];
        //如果没有指定名称,通知默认名称不存在,取第一个配置的Name
        if (!yAxisAttr) {
            name = this.coord.yAxis[0].name;
            yAxisAttr = this.yAxisAttribute[name];
        }

        let yOpts = cartesian_wm.get(yAxisAttr);
        return {
            attr: yAxisAttr,
            opts: yOpts
        }
    }

    getBoundbox() {
        //笛卡尔坐标的原点默认为左下方

        let baseBoundbox = super.getBoundbox();
        let offset = this.offset.clone();
        this.baseBoundbox = baseBoundbox;
        this.boundbox.min.set(0, 0, 0);
        this.boundbox.max.set(baseBoundbox.max.x - baseBoundbox.min.x - offset.x,
            baseBoundbox.max.y - baseBoundbox.min.y - offset.y,
            baseBoundbox.max.z - baseBoundbox.min.z - offset.z
        )

        //如果指定了Z轴的宽度就不采用默认计算的宽度
        if (this._root.opt.coord.zAxis && this._root.opt.coord.zAxis.depth) {
            this.boundbox.max.z = this._root.opt.coord.zAxis.depth;
        }

        this.center = this.boundbox.getCenter();
        this.center.setZ(-this.center.z);
        return this.boundbox;

    }
    //粗略计算在原点位置的世界线段的长度与屏幕像素的长度比
    getRatioPixelToWorldByOrigin(_origin) {
        let baseBoundbox = super.getBoundbox();
        if (_origin === undefined) {
            _origin = baseBoundbox.min.clone();
            _origin.setZ(baseBoundbox.max.z);
        }
        let ratio = this._root.renderView.getVisableSize(_origin).ratio;
        return ratio;
    }


    //更新坐标原点
    updateOrigin(offset) {

        this.offset = offset.clone();

        this.boundbox = this.getBoundbox();

        this.setWorldOrigin();

        this.updatePosition();

    }

    updatePosition() {

        //更新相机姿态
        let center = this.center.clone();
        center = this._getWorldPos(center);
        let _renderView = this._root.renderView;
        let _camera = _renderView._camera;

        //相机默认的旋转角度
        let dist = _camera.position.distanceTo(center);
        let phi = _Math.degToRad(_renderView.controls.alpha);   //(90-lat)*(Math.PI/180),
        let theta = _Math.degToRad(_renderView.controls.beta);   // (lng+180)*(Math.PI/180),

        let y = dist * Math.sin(phi);
        let temp = dist * Math.cos(phi);
        let x = temp * Math.sin(theta);
        let z = temp * Math.cos(theta);
        //平移实现以中心点为圆心的旋转结果
        let newPos = new Vector3(x, y, z);
        newPos.add(center);
        _camera.position.copy(newPos);
        //相机朝向中心点 
        _camera.lookAt(center);


        //orbite target position
        this._root.orbitControls.target.copy(center);


        //测试中心点的位置
        // let helpLine = this._root.renderView.createLine([center.clone()], new Vector3(1, 0, 0), 123, 1, 'red');
        // let helpLine2 = this._root.renderView.createLine([center.clone()], new Vector3(-1, 0, 0), 500, 1, 'red');
        // this._root.renderView._scene.add(helpLine);
        // this._root.renderView._scene.add(helpLine2);

    }

    addLights() {
        //加入灯光

        var ambientlight = new AmbientLight(0xffffff, 0.8); // soft white light

        this._root.rootStage.add(ambientlight);

        let center = this.center.clone();
        center = this._getWorldPos(center);
        //center.setY(0);

        let dirLights = [];
        let intensity = 0.8;
        let lightColor = 0xcccccc;
        let position = new Vector3(-1, -1, 1);

        dirLights[0] = new DirectionalLight(lightColor, intensity);
        position.multiplyScalar(10000);
        dirLights[0].position.copy(position);
        dirLights[0].target.position.copy(center);
        this._root.rootStage.add(dirLights[0]);


        dirLights[1] = new DirectionalLight(lightColor, intensity);
        position = new Vector3(1, -1, 1);
        position.multiplyScalar(10000);
        dirLights[1].position.copy(position);
        dirLights[1].target.position.copy(center);
        this._root.rootStage.add(dirLights[1]);


        // dirLights[2] = new DirectionalLight(lightColor, intensity);
        // position = new Vector3(-1, -1, -1);
        // position.multiplyScalar(10000);
        // dirLights[2].position.copy(position);
        // dirLights[2].target.position.copy(center);
        // this._root.rootStage.add(dirLights[2]);


        // dirLights[3] = new DirectionalLight(lightColor, intensity);
        // position = new Vector3(1, -1, -1);
        // position.multiplyScalar(10000);
        // dirLights[3].position.copy(position);
        // dirLights[3].target.position.copy(center);
        // this._root.rootStage.add(dirLights[3]);




        let pointLight = [];

        // pointLight[0] = new PointLight(lightColor, intensity);
        // position = new Vector3(-1, -1, 1);
        // position.multiplyScalar(10000);
        // pointLight[0].position.copy(position);
        // this._root.rootStage.add(pointLight[0]);


        // pointLight[1] = new PointLight(lightColor, intensity);
        // position = new Vector3(1, -1, 1);
        // position.multiplyScalar(10000);
        // pointLight[1].position.copy(position);
        // this._root.rootStage.add(pointLight[1]);


        // pointLight[2] = new PointLight(lightColor, intensity);
        // position = new Vector3(-1, -1, -1);
        // position.multiplyScalar(10000);
        // pointLight[2].position.copy(position);
        // this._root.rootStage.add(pointLight[2]);


        // pointLight[3] = new PointLight('#fff', 1);
        // position = new Vector3(1, -1, -1);
        // position.multiplyScalar(1000);
        // pointLight[3].position.copy(position);
        // this._root.rootStage.add(pointLight[3]);




    }

    setWorldOrigin() {
        let baseBoundbox = super.getBoundbox();
        let offset = this.offset.clone();
        let pos = baseBoundbox.min.clone();
        pos.setZ(baseBoundbox.max.z);
        pos.add(offset);
        this.group.position.copy(pos);
    }
    getOrigin() {
        return this.origin.clone();
    }

    initCoordUI() {

        this._coordUI = new Cartesian3DUI(this);
        this.group.add(this._coordUI.group);

    }

    drawUI() {
        super.drawUI();
        this._coordUI.draw();

        //测试
        // let ceil = this.getCeilSize();
        // let pos = new Vector3();
        // pos.setX(this.getXAxisPosition(2));
        // pos.setY(this.getYAxisPosition(100));
        // pos.setZ(this.getZAxisPosition('页面访问数'));
        // let boxWidth = ceil.x * 0.8;
        // let boxDepth = ceil.z * 0.8;
        // let boxHeight = Math.max(Math.abs(pos.y), 1);
        // let metaril = new MeshBasicMaterial({
        //     color: 'blue',
        //     transparent:true,
        //     opacity:1
        //     // polygonOffset:true,
        //     // polygonOffsetFactor:1,
        //     // polygonOffsetUnits:0.1
        // })
        // let box = this._root.renderView.createBox(boxWidth, boxHeight, boxDepth, metaril);
        // box.position.set(pos.x - boxWidth * 0.5, 0, -pos.z + boxDepth * 0.5);
        // box.renderOrder = 100;
        // this.group.add(box);

    }

    getXAxisPosition(data) {
        let _val = 0;
        let _range = this.boundbox.max.x - this.boundbox.min.x;
        let dataLen = this.xAxisAttribute.getSection().length;
        let ind = _.indexOf(this.xAxisAttribute.getSection(), data);//先不考虑不存在的值
        var layoutType = this.coord.xAxis.layoutType;
        if (dataLen == 1) {
            _val = _range / 2;

        } else {
            if (layoutType == "rule") {
                //折线图的xyaxis就是 rule
                _val = ind / (dataLen - 1) * _range;
            };
            if (layoutType == "proportion") {
                //按照数据真实的值在minVal - maxVal 区间中的比例值
                // if (val == undefined) {
                //     val = (ind * (this.maxVal - this.minVal) / (dataLen - 1)) + this.minVal;
                // };
                // x = _range * ((val - this.minVal) / (this.maxVal - this.minVal));
                _val = _range * ((data - minVal) / (maxVal - minVal));

            };
            if (layoutType == "peak") {
                //柱状图的就是peak
                var _ceilWidth = _range / dataLen;
                // if (this.posParseToInt) {
                //     _ceilWidth = parseInt(_ceilWidth);
                // };
                _val = _ceilWidth * (ind + 1) - _ceilWidth / 2;
            };
        };

        if (isNaN(_val)) {
            _val = 0;
        };

        return _val;


    }
    getYAxisPosition(data, yAxisAttribute) {
        let _val = 0;
        let _range = this.boundbox.max.y - this.boundbox.min.y;
        let dataLen = yAxisAttribute.getSection().length;
        let ind = _.indexOf(yAxisAttribute.getSection(), data);//先不考虑不存在的值

        let _yAxisLeft = _.find(this.coord.yAxis, yaxis => {
            return !yaxis.align || yaxis.align == 'left';
        })
        let layoutType = _yAxisLeft.layoutType;

        let maxVal = Math.max.apply(null, yAxisAttribute.getSection());
        let minVal = Math.min.apply(null, yAxisAttribute.getSection());

        if (dataLen == 1) {
            _val = _range / 2;

        } else {
            if (layoutType == "rule") {
                //折线图的xyaxis就是 rule
                _val = ind / (dataLen - 1) * _range;
            };
            if (layoutType == "proportion") {
                //按照数据真实的值在minVal - maxVal 区间中的比例值
                // if (val == undefined) {
                //     val = (ind * (this.maxVal - this.minVal) / (dataLen - 1)) + this.minVal;
                // };
                _val = _range * ((data - minVal) / (maxVal - minVal));
            };
            if (layoutType == "peak") {
                //柱状图的就是peak
                var _ceilWidth = _range / dataLen;
                // if (this.posParseToInt) {
                //     _ceilWidth = parseInt(_ceilWidth);
                // };

                _val = _ceilWidth * (ind + 1) - _ceilWidth / 2;
            };
        };

        if (isNaN(_val)) {
            _val = 0;
        };

        return _val;

    }
    getZAxisPosition(data) {
        let _val = 0;
        let _range = this.boundbox.max.z - this.boundbox.min.z;
        let dataLen = this.zAxisAttribute.getSection().length;
        let ind = _.indexOf(this.zAxisAttribute.getSection(), data);//先不考虑不存在的值
        var layoutType = this.coord.zAxis.layoutType;

        if (dataLen == 1) {
            _val = _range / 2;

        } else {
            if (layoutType == "rule") {
                //折线图的xyaxis就是 rule
                _val = ind / (dataLen - 1) * _range;
            };
            if (layoutType == "proportion") {
                //按照数据真实的值在minVal - maxVal 区间中的比例值
                // if (val == undefined) {
                //     val = (ind * (this.maxVal - this.minVal) / (dataLen - 1)) + this.minVal;
                // };
                // x = _range * ((val - this.minVal) / (this.maxVal - this.minVal));
                _val = _range * ((data - minVal) / (maxVal - minVal));
            };
            if (layoutType == "peak") {
                //柱状图的就是peak
                var _ceilWidth = _range / dataLen;
                // if (this.posParseToInt) {
                //     _ceilWidth = parseInt(_ceilWidth);
                // };

                _val = _ceilWidth * (ind + 1) - _ceilWidth / 2;
            };
        };

        if (isNaN(_val)) {
            _val = 0;
        };

        return _val;
    }

    getCeilSize() {

        let ceil = new Vector3();
        let size = this.boundbox.getSize();
        let dataLenX = this.xAxisAttribute.getSection().length;
        let dataLenY = this.getYAxis().attr.getSection().length;
        let dataLenZ = this.zAxisAttribute.getSection().length;

        // dataLenX = dataLenX - 1 > 0 ? dataLenX : 3;
        // dataLenY = dataLenY - 1 > 0 ? dataLenY : 3;
        // dataLenZ = dataLenZ - 1 > 0 ? dataLenZ : 3;
        if (this.coord.xAxis.layoutType == 'peak') {
            ceil.setX(size.x / (dataLenX));
        } else {
            ceil.setX(size.x / (dataLenX + 1));
        }

        ceil.setY(size.y / (dataLenY + 1));
        if (this.coord.zAxis.layoutType == 'peak') {
            ceil.setZ(size.z / (dataLenZ));
        } else {
            ceil.setZ(size.z / (dataLenZ + 1));
        }


        return ceil;

    }

    positionToScreen(pos) {
        return positionToScreen.call(this, pos);
    }

    dispose() {

        this._coordUI.dispose();
    }



}


let positionToScreen = (function () {
    let matrix = new Matrix4();

    return function (pos) {
        let pCam = this._root.renderView._camera;
        const widthHalf = 0.5 * this._root.width;
        const heightHalf = 0.5 * this._root.height;

        let target = this.group.localToWorld(pos);

        target.project(pCam, matrix);

        target.x = (target.x * widthHalf) + widthHalf;
        target.y = (- (target.y * heightHalf) + heightHalf);
        return target;
    }
})();




export { Cartesian3D };