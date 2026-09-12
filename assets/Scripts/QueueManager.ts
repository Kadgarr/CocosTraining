import { _decorator, Component, Node, Label, Sprite, Color, Prefab, instantiate } from 'cc';
import { TrackManager } from './TrackManager';
import { ColorType } from './Types';
import { UnitSlot } from './UnitSlot';
const { ccclass, property } = _decorator;

export interface UnitData {
    colorType: ColorType;
    capacity: number;
}

@ccclass('QueueManager')
export class QueueManager extends Component {
    @property(TrackManager)
    public trackManager: TrackManager = null!;

    // Родительские узлы для 4-х колонок на UI / сцене
    @property([Node])
    public columnNodes: Node[] = [];

    // Префаб отображения слота юнита
    @property(Prefab)
    public unitSlotPrefab: Node = null!;

    // 2D массив юнитов: columnsData[colIndex][rowIndex]
    private columnsData: UnitData[][] = [];

    start() {
        this.generateDeckData();
        this.renderDeck();
    }

    private generateDeckData() {

        const numColumns = 4;
        const unitsPerColumn = 3;
        const colors = [ColorType.WHITE, ColorType.BLACK];
        const capacity=20;

        this.columnsData = [];

        for (let col = 0; col < numColumns; col++) {
            const column: UnitData[] = [];
            for (let row = 0; row < unitsPerColumn; row++) {
                // Случайный цвет и емкость
                const randomColor = colors[Math.floor(Math.random() * colors.length)];

                column.push({
                colorType: randomColor,
                capacity: capacity
                });
            }
        this.columnsData.push(column);
        }
    }

    public onUnitSlotClicked(colIndex: number) {
        if (colIndex < 0 || colIndex >= this.columnsData.length) return;

        const col = this.columnsData[colIndex];
        if (!col || col.length === 0) return;

        // Проверяем, есть ли место на треке
        if (!this.trackManager.canSpawnUnit()) {
            console.log("Трек заполнен! Нельзя заспавнить юнита.");
            return;
        }

        // Забираем передний юнит из выбранной колонки
        const selectedUnit = col.shift()!;

        // Добавляем новый случайный юнит в конец колонки для бесконечного потока
        col.push(this.getRandomUnitData());

        // Спавним забранный юнит на стартовый вейпоинт трека
        this.trackManager.spawnUnit(selectedUnit.colorType, selectedUnit.capacity);

        // Обновляем отображение колоды
        this.renderDeck();
    }

    private getRandomUnitData(): UnitData {
        const colors = [ColorType.WHITE, ColorType.BLACK];
        const capacities = [10, 15, 20, 25];

        return {
            colorType: colors[Math.floor(Math.random() * colors.length)],
            capacity: capacities[Math.floor(Math.random() * capacities.length)]
        };
    }

    private renderDeck() {
        for (let colIndex = 0; colIndex < this.columnNodes.length; colIndex++) {
            const colNode = this.columnNodes[colIndex];
            if (!colNode) continue;

            // Очищаем старые ноды
            colNode.removeAllChildren();

            const colData = this.columnsData[colIndex];
            if (!colData) continue;

            // Отрисовываем юниты в колонке
            for (let rowIndex = 0; rowIndex < colData.length; rowIndex++) {
                const unitData = colData[rowIndex];
                const slotNode = instantiate(this.unitSlotPrefab);
                slotNode.parent = colNode;

                // Настраиваем компонент UnitSlot
                const slotScript = slotNode.getComponent(UnitSlot);
                if (slotScript) {
                    const isInteractive = (rowIndex === 0); // Кликабелен только передний юнит
                    slotScript.init(unitData, colIndex, isInteractive, this);
                }
            }
        }
    }
}
