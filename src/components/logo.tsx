import HdfcLogo from "../assets/Hdfc-Logo-Main.svg";

const Logo = ({ className = "" }) => {
  return (
    <img src={HdfcLogo} alt="HDFC Logo" className={className} />
  );
};

export default Logo;
