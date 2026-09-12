import { _decorator, Component, Node, Prefab, instantiate, Vec3, Material, Label } from 'cc';
import { GridManager } from './GridManager';
import { UnitController, TrackPointInfo } from './UnitController';
import { ColorType, TrackSide } from './Types';
const { ccclass, property } = _decorator;

@ccclass('TrackManager')
export class TrackManager extends Component {
    
    @property(GridManager)
    public gridManager: GridManager = null!;

    @property(Prefab)
    public unitPrefab: Prefab = null!;

    @property(Material)
    public whiteMaterial: Material = null!;

    @property(Material)
    public blackMaterial: Material = null!;

    @property
    public trackOffset: number = 1.8; // Отступ трека от края сетки

    @property
    public maxActiveUnits: number = 5;
    
    @property(Label)
    public slotCounterLabel: Label = null!;

    private waypoints: TrackPointInfo[] = [];
    private activeUnits: UnitController[] = [];

    start() {
        this.scheduleOnce(() => {
        this.generateWaypoints();
        this.updateSlotUI();
        // spawnTestUnit() больше не вызываем!
    }, 0);
}

    /**
     * Генерация вейпоинтов вокруг сетки по часовой стрелке
     */
    public generateWaypoints() {
        this.waypoints = [];

        const rows = this.gridManager.rows;
        const cols = this.gridManager.cols;
        const spacing = this.gridManager.spacing;

        const offsetX = -((cols - 1) * spacing) / 2;
        const offsetZ = -((rows - 1) * spacing) / 2;

        const minX = offsetX - this.trackOffset;
        const maxX = -offsetX + this.trackOffset;
        const minZ = offsetZ - this.trackOffset;
        const maxZ = -offsetZ + this.trackOffset;

        // 1. Нижняя сторона (BOTTOM): слева направо (col: 0 -> cols-1)
        for (let c = 0; c < cols; c++) {
            const posX = offsetX + c * spacing;
            this.waypoints.push({
                position: new Vec3(posX, 0, maxZ),
                side: TrackSide.BOTTOM,
                gridIndex: c
            });
        }

        // 2. Правая сторона (RIGHT): снизу вверх (row: rows-1 -> 0)
        for (let r = rows - 1; r >= 0; r--) {
            const posZ = offsetZ + r * spacing;
            this.waypoints.push({
                position: new Vec3(maxX, 0, posZ),
                side: TrackSide.RIGHT,
                gridIndex: r
            });
        }

        // 3. Верхняя сторона (TOP): справа налево (col: cols-1 -> 0)
        for (let c = cols - 1; c >= 0; c--) {
            const posX = offsetX + c * spacing;
            this.waypoints.push({
                position: new Vec3(posX, 0, minZ),
                side: TrackSide.TOP,
                gridIndex: c
            });
        }

        // 4. Левая сторона (LEFT): сверху вниз (row: 0 -> rows-1)
        for (let r = 0; r < rows; r++) {
            const posZ = offsetZ + r * spacing;
            this.waypoints.push({
                position: new Vec3(minX, 0, posZ),
                side: TrackSide.LEFT,
                gridIndex: r
            });
        }
    }

    /**
     * Проверка доступности слотов на треке
     */
    public canSpawnUnit(): boolean {
        return this.activeUnits.length < this.maxActiveUnits;
    }

    /**
     * Спавн юнита на трек
     */
    public spawnUnit(colorType: ColorType, capacity: number): UnitController | null {
    if (!this.canSpawnUnit()) return null;

    const unitNode = instantiate(this.unitPrefab);
    unitNode.setParent(this.node);

    const unitComp = unitNode.getComponent(UnitController);
    const mat = colorType === ColorType.WHITE ? this.whiteMaterial : this.blackMaterial;

    if (unitComp) {
        unitComp.init(colorType, capacity, this.waypoints, 0, mat, this.gridManager, this);
        
        unitNode.on('unit-destroyed', (unit: UnitController) => {
            this.removeUnit(unit);
        }, this);

        this.activeUnits.push(unitComp);
        this.updateSlotUI();
        return unitComp;
    }

    return null;
}

    /**
     * Удаление юнита с трека
     */
    public removeUnit(unit: UnitController) {
        const index = this.activeUnits.indexOf(unit);
        if (index !== -1) {
            this.activeUnits.splice(index, 1);
            unit.node.destroy();
        }
    }

    /**
     * Тестовый спавн одного юнита для проверки движения по треку
     */
    private spawnTestUnit() {
        this.spawnUnit(ColorType.WHITE, 20);
    }


        /** Вызывается, когда юнит потратил всю емкость (capacity <= 0) в пути */
    public onUnitDiedByCapacity(unit: UnitController) {
        this.removeActiveUnit(unit);
        this.updateSlotUI(); // Возвращает свободный слот (например, 4/5 -> 5/5)
    }

    /** Вызывается, когда юнит дошел до конца пути */
    public onUnitReachedEnd(unit: UnitController) {
        this.removeActiveUnit(unit);
        this.maxActiveUnits = Math.max(0, this.maxActiveUnits - 1); // Уменьшаем максимальный лимит
        this.updateSlotUI(); // Изменяет лимит (например, 4/5 -> 4/4)
    }

    /** Вспомогательный метод удаления из списка активных юнитов */
    private removeActiveUnit(unit: UnitController) {
        const index = this.activeUnits.indexOf(unit);
        if (index !== -1) {
            this.activeUnits.splice(index, 1);
        }
    }

    /** Обновление текста счетчика */
    public updateSlotUI() {
        if (this.slotCounterLabel) {
            const availableSlots = Math.max(0, this.maxActiveUnits - this.activeUnits.length);
            this.slotCounterLabel.string = `${availableSlots}/${this.maxActiveUnits}`;
        }
    }
        
}