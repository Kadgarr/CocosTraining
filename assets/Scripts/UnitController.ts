import { _decorator, Component, Node, Vec3, Label, MeshRenderer, Material } from 'cc';
import { ColorType, TrackSide } from './Types';
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

    public colorType: ColorType = ColorType.WHITE;
    public capacity: number = 20;

    private waypoints: TrackPointInfo[] = [];
    private currentTargetIndex: number = 0;
    private isMoving: boolean = false;

    /**
     * Инициализация юнита при спавне на трек
     */
    public init(
        colorType: ColorType, 
        capacity: number, 
        waypoints: TrackPointInfo[], 
        startIndex: number,
        mat: Material
    ) {
        this.colorType = colorType;
        this.capacity = capacity;
        this.waypoints = waypoints;
        this.currentTargetIndex = startIndex;

        if (this.meshRenderer && mat) {
            this.meshRenderer.material = mat;
        }

        this.updateLabel();
        
        if (this.waypoints.length > 0) {
            this.node.setPosition(this.waypoints[this.currentTargetIndex].position);
            // Целимся в следующую точку
            this.currentTargetIndex = (this.currentTargetIndex + 1) % this.waypoints.length;
            this.isMoving = true;
        }
    }

    update(dt: number) {
        if (!this.isMoving || this.waypoints.length === 0) return;

        const targetInfo = this.waypoints[this.currentTargetIndex];
        const targetPos = targetInfo.position;
        const currentPos = this.node.position;

        // Направление к следующему вейпоинту
        const dir = targetPos.clone().subtract(currentPos);
        const distance = dir.length();

        const moveDist = this.speed * dt;

        if (distance <= moveDist) {
            // Достигли точки, мгновенно перемещаемся в неё
            this.node.setPosition(targetPos);
            // Переходим к следующей точке по кругу
            this.currentTargetIndex = (this.currentTargetIndex + 1) % this.waypoints.length;
        } else {
            // Двигаемся к точке
            dir.normalize();
            const newPos = currentPos.add(dir.multiplyScalar(moveDist));
            this.node.setPosition(newPos);
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
}