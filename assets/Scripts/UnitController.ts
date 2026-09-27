import { _decorator, Component, Node, Vec3, Quat, Label, MeshRenderer, Material, Color, Animation } from 'cc';
import { ColorType, TrackSide } from './Types';
import { TrackManager } from './TrackManager';
import { UnitSkin } from './UnitSkin';
import type { GridManager } from './GridManager';
const { ccclass, property } = _decorator;

export interface TrackPointInfo {
    position: Vec3;
    side: TrackSide;
    gridIndex: number; // Индекс столбца или строки сетки
}

@ccclass('UnitController')
export class UnitController extends Component {

    @property(Label)
    public capacityLabel: Label = null!;

    @property(MeshRenderer)
    public meshRenderer: MeshRenderer = null!;

    @property
    public speed: number = 5.0;

    @property({ tooltip: 'Скорость поворота к сетке (чем больше, тем резче)' })
    public turnSpeed: number = 12;

    public colorType: ColorType = ColorType.WHITE;

    // Число над кроликом не вращается вместе с ним: храним его положение и поворот в мире
    private labelWorldOffset = new Vec3();
    private labelWorldRot = new Quat();
    private readonly tmpQuat = new Quat();
    private readonly tmpVec = new Vec3();
    private shotAnim: Animation | null = null;
    public capacity: number = 20;

    private waypoints: TrackPointInfo[] = [];
    private currentTargetIndex: number = 0;
    private isMoving: boolean = false;
    private gridManager: GridManager | null = null;
    private trackManager: TrackManager | null = null;
    private waypointsVisited: number = 0; // Счетчик пройденных точек трека

    /**
     * Инициализация юнита при спавне на трек
     */
    public init(
        colorType: ColorType, 
        capacity: number, 
        waypoints: TrackPointInfo[], 
        startIndex: number,
        mat: Material | Material[],
        gridManager?: GridManager,
        trackManager?: TrackManager
        ) {
            this.colorType = colorType;
            this.capacity = capacity;
            this.waypoints = waypoints;
            this.currentTargetIndex = startIndex;
            this.waypointsVisited = 0;
            if (gridManager) this.gridManager = gridManager;
            if (trackManager) this.trackManager = trackManager;

            // Материалы кролика (корпус, детали, блик) под цвет юнита
            UnitSkin.apply(this.meshRenderer, mat);

            // Число: белое у черных юнитов, черное у белых, с контрастной обводкой
            UnitSkin.styleLabel(this.capacityLabel, colorType);

            this.updateLabel();
        
            if (this.waypoints.length > 0) {
                const startPointInfo = this.waypoints[this.currentTargetIndex];
                this.node.setPosition(startPointInfo.position);

                // Запоминаем положение числа (узел ещё не повёрнут) и сразу разворачиваем кролика к сетке
                if (this.capacityLabel) {
                    Vec3.subtract(this.labelWorldOffset, this.capacityLabel.node.worldPosition, this.node.worldPosition);
                    this.labelWorldRot.set(this.capacityLabel.node.worldRotation);
                }
                this.faceGrid(0, true);
        
                // Проверяем сбор сразу на стартовой точке
                this.checkBlockCollection(startPointInfo);

                // Если у юнита осталась емкость — взводим движение к следующей точке
                if (this.capacity > 0) {
                this.currentTargetIndex = (this.currentTargetIndex + 1) % this.waypoints.length;
                    this.isMoving = true;
                }
            }
        }

        update(dt: number) {
            if (!this.isMoving || this.waypoints.length === 0) return;
            this.faceGrid(dt, false);

            const targetInfo = this.waypoints[this.currentTargetIndex];
            const targetPos = targetInfo.position;
            const currentPos = this.node.position;

            // Направление к следующему вейпоинту
            const dir = targetPos.clone().subtract(currentPos);
            const distance = dir.length();

            const moveDist = this.speed * dt;

            if (distance <= moveDist) {
                this.node.setPosition(targetPos);
        
                // Поглощаем блоки при достижении вейпоинта
                this.checkBlockCollection(targetInfo);

                // Если емкость закончилась — юнит уже уничтожен в checkBlockCollection
                if (this.capacity <= 0) return;

                this.waypointsVisited++;

                // Если юнит прошел полный круг (все вейпоинты)
                const isOpenPath = this.trackManager ? this.trackManager.isOpenPath() : false;
                const reachedEnd = isOpenPath
                    ? this.currentTargetIndex >= this.waypoints.length - 1
                    : this.waypointsVisited >= this.waypoints.length;
                if (reachedEnd) {
                    this.onReachedEnd();
                    return;
                }

                this.currentTargetIndex = (this.currentTargetIndex + 1) % this.waypoints.length;
            } else {
                // Двигаемся к точке
                dir.normalize();
                const newPos = currentPos.add(dir.multiplyScalar(moveDist));
                this.node.setPosition(newPos);
            }
        }

        /** Проигрывает клип выстрела с начала (перезапуск при частых выстрелах) */
        private playShotAnimation() {
            if (!this.shotAnim) this.shotAnim = this.getComponent(Animation);
            const anim = this.shotAnim;
            if (!anim || !anim.defaultClip) return;
            anim.stop();
            anim.play(anim.defaultClip.name);
        }

        /**
         * Поворачивает кролика грудью (+Z модели) к ближайшей точке сетки.
         * На прямых участках — строго на сетку, на углах конвейера — плавно по диагонали.
         */
        private faceGrid(dt: number, instant: boolean) {
            const gm = this.gridManager;
            if (gm) {
                const o = gm.node.worldPosition;
                const hx = ((gm.cols - 1) * gm.spacing) / 2;
                const hz = ((gm.rows - 1) * gm.spacing) / 2;
                const p = this.node.worldPosition;
                const cx = Math.min(Math.max(p.x, o.x - hx), o.x + hx);
                const cz = Math.min(Math.max(p.z, o.z - hz), o.z + hz);
                const dx = cx - p.x, dz = cz - p.z;
                if (dx * dx + dz * dz > 1e-6) {
                    // +180°: модель развёрнута так, чтобы к сетке смотрела нужная сторона кролика
                    const yaw = Math.atan2(dx, dz) * 180 / Math.PI + 180;
                    Quat.fromEuler(this.tmpQuat, 0, yaw, 0);
                    if (instant) {
                        this.node.setWorldRotation(this.tmpQuat);
                    } else {
                        const k = 1 - Math.exp(-this.turnSpeed * dt);
                        const cur = this.node.worldRotation.clone();
                        Quat.slerp(cur, cur, this.tmpQuat, k);
                        this.node.setWorldRotation(cur);
                    }
                }
            }
            // Число всегда смотрит в камеру и стоит над центром кролика
            if (this.capacityLabel) {
                const ln = this.capacityLabel.node;
                ln.setWorldRotation(this.labelWorldRot);
                Vec3.add(this.tmpVec, this.node.worldPosition, this.labelWorldOffset);
                ln.setWorldPosition(this.tmpVec);
            }
        }

        /**
         * Получить информацию о текущем отрезке/стороне для проверки сбора блоков
         */
        public getCurrentTrackInfo(): TrackPointInfo | null {
            if (this.waypoints.length === 0) return null;
            return this.waypoints[this.currentTargetIndex];
        }

        /**
         * Уменьшение емкости юнита
         */
        public consumeCapacity(amount: number = 1): boolean {
            this.capacity -= amount;
            if (this.capacity < 0) this.capacity = 0;
            this.updateLabel();
            return this.capacity === 0;
        }

        private updateLabel() {
            if (this.capacityLabel) {
                this.capacityLabel.string = this.capacity.toString();
            }
        }

        private checkBlockCollection(pointInfo: TrackPointInfo) {

            if (!this.gridManager || this.capacity <= 0) return;
            if (pointInfo.gridIndex < 0) return; // точки на углах трека — без сбора

            // Берем текущую мировую позицию юнита для спавна снаряда
            const unitPos = this.node.worldPosition;
            while (this.capacity > 0 && this.gridManager.tryConsumeOuterBlock(pointInfo.side, pointInfo.gridIndex, this.colorType, unitPos)) {
                this.playShotAnimation();   // выстрел: «пульс» юнита (клип UnitShot)
                const isEmpty = this.consumeCapacity(1);
                if (isEmpty) {
                    this.onCapacityDepleted();
                    break;
                }
            }
         }

                /** Юнит потратил всю емкость (емкость <= 0) */
        private onCapacityDepleted() {
            this.isMoving = false;
            if (this.trackManager) {
                this.trackManager.onUnitDiedByCapacity(this);
            }
            this.node.destroy();
        }

        /** Юнит дошел до конца замкнутого пути (финиш) */
        private onReachedEnd() {
            this.isMoving = false;
            if (this.trackManager) {
                this.trackManager.onUnitReachedEnd(this);
            }
            this.node.destroy();
        }
}