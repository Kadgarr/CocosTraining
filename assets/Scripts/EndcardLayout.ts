import { _decorator, Component, Node, UITransform, Widget, view } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Адаптивная раскладка финального экрана (победа / поражение).
 * Панель растянута Widget'ом на весь Canvas, а блок content (заголовок + кнопка)
 * масштабируется так, чтобы влезать в заданную долю ширины и высоты экрана
 * на любом телефоне — и в портрете, и в ландшафте.
 */
@ccclass('EndcardLayout')
export class EndcardLayout extends Component {

    @property({ type: Node, tooltip: 'Блок с заголовком и кнопкой (масштабируется целиком)' })
    public content: Node = null!;

    @property({ tooltip: 'Максимальная доля ширины экрана под контент' })
    public maxWidthFraction: number = 0.9;

    @property({ tooltip: 'Максимальная доля высоты экрана под контент' })
    public maxHeightFraction: number = 0.6;

    @property({ tooltip: 'Верхний предел масштаба (чтобы на планшетах не было огромным)' })
    public maxScale: number = 1.2;

    onEnable() {
        this.relayout();
        // Canvas получает итоговый размер к следующему кадру
        this.scheduleOnce(() => this.relayout(), 0);
        view.on('canvas-resize', this.onResize, this);
    }

    onDisable() {
        view.off('canvas-resize', this.onResize, this);
    }

    private onResize() {
        this.scheduleOnce(() => this.relayout(), 0);
    }

    public relayout() {
        if (!this.content) return;
        this.getComponent(Widget)?.updateAlignment();
        const panel = this.getComponent(UITransform);
        const box = this.content.getComponent(UITransform);
        if (!panel || !box || box.width <= 0 || box.height <= 0) return;

        // Видимая область экрана в единицах Canvas (надёжнее, чем размер панели до первого кадра)
        const v = view.getVisibleSize();
        let W = v.width, H = v.height;
        if (W <= 0 || H <= 0) { W = panel.width; H = panel.height; }
        const s = Math.min(this.maxScale,
            (W * this.maxWidthFraction) / box.width,
            (H * this.maxHeightFraction) / box.height);
        this.content.setScale(s, s, 1);
        this.content.setPosition(0, 0, 0);
    }
}
