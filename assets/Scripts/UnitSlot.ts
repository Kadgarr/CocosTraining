import { _decorator, Component, Node, Label, Sprite, Color, MeshRenderer, Mesh, UITransform } from 'cc';
import { UnitSkin } from './UnitSkin';
import { ColorType } from './Types';
import { QueueManager, UnitData } from './QueueManager';
const { ccclass, property } = _decorator;

@ccclass('UnitSlot')
export class UnitSlot extends Component {
    @property(Label)
    public capacityLabel: Label = null!;

    @property(Sprite)
    public iconSprite: Sprite = null!;

    @property({ type: MeshRenderer, tooltip: '3D-модель кролика в UI (UIMeshRenderer)' })
    public modelRenderer: MeshRenderer = null!;

    @property({ type: Node, tooltip: 'Запечённая тень кролика (рисуется перед моделью, трансформ как у модели)' })
    public shadowNode: Node = null!;

    // В UI нет освещения, поэтому цвет и затенение запечены в цвета вершин: отдельный меш на каждый цвет
    @property({ type: Mesh, tooltip: 'UI-меш белого кролика (Unit_Bunny_UI.glb)' })
    public whiteModelMesh: Mesh = null!;

    @property({ type: Mesh, tooltip: 'UI-меш черного кролика (Unit_Bunny_UI.glb)' })
    public blackModelMesh: Mesh = null!;

    private columnIndex: number = -1;
    private isInteractive: boolean = false;
    private queueManager: QueueManager = null!;
    private colorType: ColorType = ColorType.WHITE;

    public init(data: UnitData, colIndex: number, interactive: boolean, manager: QueueManager) {
        this.columnIndex = colIndex;
        this.isInteractive = interactive;
        this.queueManager = manager;
        this.colorType = data.colorType;

        if (this.capacityLabel) {
            this.capacityLabel.string = data.capacity.toString();
        }

        // 3D-кролик нужного цвета и стиль числа (у задних юнитов число полупрозрачное, как в референсе)
        if (this.modelRenderer) {
            const mesh = data.colorType === ColorType.WHITE ? this.whiteModelMesh : this.blackModelMesh;
            if (mesh) this.modelRenderer.mesh = mesh;
        }
        UnitSkin.styleLabel(this.capacityLabel, data.colorType, interactive ? 255 : 110);

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

    /** Базовый масштаб модели в префабе (под него подобраны позиции числа) */
    private static readonly BASE_MODEL_SCALE = 90;

    /**
     * Масштаб кнопки: модель кролика (в UI-единицах на метр), число и область клика растут вместе.
     * Размер области клика подобран под проекцию кролика под углом 70°.
     */
    public applyScale(modelScale: number) {
        const k = modelScale / UnitSlot.BASE_MODEL_SCALE;
        const model = this.modelRenderer ? this.modelRenderer.node : null;
        if (model) model.setScale(modelScale, modelScale, modelScale);
        if (this.shadowNode) this.shadowNode.setScale(modelScale, modelScale, modelScale);
        if (this.capacityLabel) {
            this.capacityLabel.node.setScale(k, k, 1);
            this.capacityLabel.node.setPosition(0, 6 * k, 0);
        }
        const ui = this.getComponent(UITransform);
        if (ui) ui.setContentSize(0.8 * modelScale, 1.25 * modelScale);
    }

    /**
     * Включает/выключает кликабельность уже созданной кнопки (при сдвиге колонки).
     * restyle — обновить прозрачность числа (передний юнит — непрозрачное).
     */
    public setInteractive(v: boolean, restyle: boolean = true) {
        this.node.off(Node.EventType.TOUCH_END, this.onClick, this);
        this.isInteractive = v;
        if (v) this.node.on(Node.EventType.TOUCH_END, this.onClick, this);
        if (restyle) UnitSkin.styleLabel(this.capacityLabel, this.colorType, v ? 255 : 110);
    }

    private onClick() {
        if (!this.isInteractive || !this.queueManager) return;
        this.queueManager.onUnitSlotClicked(this.columnIndex);
    }
}
