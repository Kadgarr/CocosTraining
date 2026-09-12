import { _decorator, Component, Node, Label, Sprite, Color } from 'cc';
import { ColorType } from './Types';
import { QueueManager, UnitData } from './QueueManager';
const { ccclass, property } = _decorator;

@ccclass('UnitSlot')
export class UnitSlot extends Component {
    @property(Label)
    public capacityLabel: Label = null!;

    @property(Sprite)
    public iconSprite: Sprite = null!;

    private columnIndex: number = -1;
    private isInteractive: boolean = false;
    private queueManager: QueueManager = null!;

    public init(data: UnitData, colIndex: number, interactive: boolean, manager: QueueManager) {
        this.columnIndex = colIndex;
        this.isInteractive = interactive;
        this.queueManager = manager;

        if (this.capacityLabel) {
            this.capacityLabel.string = data.capacity.toString();
        }

        // Цвет плашки (белый / черный)
        if (this.iconSprite) {
            this.iconSprite.color = data.colorType === ColorType.WHITE ? Color.WHITE : Color.BLACK;
        }

        // Подписываемся на клик только если это первый юнит в колонке
        if (this.isInteractive) {
            this.node.on(Node.EventType.TOUCH_END, this.onClick, this);
        } else {
            // Визуально притеняем задние юниты
            if (this.iconSprite) {
                const c = this.iconSprite.color;
                this.iconSprite.color = new Color(c.r * 0.7, c.g * 0.7, c.b * 0.7, 255);
            }
        }
    }

    private onClick() {
        if (!this.isInteractive || !this.queueManager) return;
        this.queueManager.onUnitSlotClicked(this.columnIndex);
    }
}
