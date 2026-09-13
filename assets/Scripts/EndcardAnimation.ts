import { _decorator, Component, Vec3, tween, UIOpacity } from 'cc';
const { ccclass } = _decorator;

@ccclass('EndcardAnimation')
export class EndcardAnimation extends Component {
    protected onEnable() {
        this.node.setScale(new Vec3(0.5, 0.5, 0.5));
        
        let opacityComp = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
        opacityComp.opacity = 0;

        tween(this.node)
            .to(0.4, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();

        tween(opacityComp)
            .to(0.3, { opacity: 255 })
            .start();
    }
}