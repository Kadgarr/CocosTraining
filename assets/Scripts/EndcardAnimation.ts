import { _decorator, Component, Node, Vec3, tween, Tween, UIOpacity } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Появление финального экрана: затемнение и текст плавно проявляются,
 * а блок с контентом «выпрыгивает» из уменьшенного состояния.
 * Масштабируется только target (контент), чтобы затемнение всегда закрывало весь экран.
 */
@ccclass('EndcardAnimation')
export class EndcardAnimation extends Component {

    @property({ type: Node, tooltip: 'Что «выпрыгивает» (блок с заголовком и кнопкой). Пусто — вся панель' })
    public target: Node | null = null;

    @property({ tooltip: 'Длительность появления, сек' })
    public duration: number = 0.4;

    private baseScale = new Vec3(1, 1, 1);

    protected onEnable() {
        const node = this.target || this.node;
        // Итоговый масштаб контента задаёт EndcardLayout — анимируем относительно него
        this.baseScale.set(node.scale);
        if (this.baseScale.x === 0) this.baseScale.set(1, 1, 1);

        const opacityComp = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
        Tween.stopAllByTarget(node);
        Tween.stopAllByTarget(opacityComp);

        node.setScale(this.baseScale.x * 0.5, this.baseScale.y * 0.5, 1);
        opacityComp.opacity = 0;

        tween(node)
            .to(this.duration, { scale: new Vec3(this.baseScale.x, this.baseScale.y, 1) }, { easing: 'backOut' })
            .start();

        tween(opacityComp)
            .to(this.duration * 0.75, { opacity: 255 })
            .start();
    }
}
